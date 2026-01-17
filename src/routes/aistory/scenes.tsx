import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import {
	Check,
	ChevronDown,
	ChevronUp,
	Clapperboard,
	Download,
	Film,
	ImageIcon,
	Loader2,
	Play,
	Plus,
	Save,
	Trash2,
	Upload,
	User,
	Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CountdownProgress } from "@/components/countdown-progress";
import {
	useGenerateCharacter,
	useGenerateSceneAudio,
	useGenerateSceneImage,
	useGenerateSceneVideo,
	useUpdateSceneCaption,
	useUploadCharacter,
	pollMediaUntilReady,
} from "@/hooks/use-aistory-api";
import { aistoryActions, aistoryStore } from "@/stores/aistory.store";

export const Route = createFileRoute("/aistory/scenes")({
	beforeLoad: () => {
		const state = aistoryStore.state;
		if (!state.promptsGenerated || !state.characterPrompt) {
			throw redirect({ to: "/aistory" });
		}
	},
	component: ScenesPage,
});

// Scenes Page: Character + Scene generation
function ScenesPage() {
	const navigate = useNavigate();

	// React Query mutations
	const generateCharacterMutation = useGenerateCharacter();
	const uploadCharacterMutation = useUploadCharacter();
	const generateSceneImageMutation = useGenerateSceneImage();
	const generateSceneAudioMutation = useGenerateSceneAudio();
	const generateSceneVideoMutation = useGenerateSceneVideo();
	const updateSceneCaptionMutation = useUpdateSceneCaption();

	// Subscribe to store state
	const characterPrompt = useStore(
		aistoryStore,
		(state) => state.characterPrompt,
	);
	const characterImageId = useStore(
		aistoryStore,
		(state) => state.characterImageId,
	);
	const characterImageUrl = useStore(
		aistoryStore,
		(state) => state.characterImageUrl,
	);
	const characterFileId = useStore(
		aistoryStore,
		(state) => state.characterFileId,
	);
	const characterFalImageUrl = useStore(
		aistoryStore,
		(state) => state.characterFalImageUrl,
	);
	const isGeneratingCharacter = useStore(
		aistoryStore,
		(state) => state.isGeneratingCharacter,
	);
	const scenes = useStore(aistoryStore, (state) => state.scenes);
	const playingSceneId = useStore(
		aistoryStore,
		(state) => state.playingSceneId,
	);
	const sceneError = useStore(aistoryStore, (state) => state.sceneError);
	const videoEngine = useStore(aistoryStore, (state) => state.videoEngine);
	const imageEngine = useStore(aistoryStore, (state) => state.imageEngine);
	const imageStyle = useStore(aistoryStore, (state) => state.imageStyle);
	const voiceId = useStore(aistoryStore, (state) => state.voiceId);
	const storyId = useStore(aistoryStore, (state) => state.storyId);
	const exportedVideoUrl = useStore(
		aistoryStore,
		(state) => state.exportedVideoUrl,
	);

	// State for word-by-word caption display during audio playback
	const [currentWordIndex, setCurrentWordIndex] = useState<number | null>(null);

	// State for tracking which scenes have unsaved caption changes
	const [savedCaptions, setSavedCaptions] = useState<Record<string, string>>(
		{},
	);
	const [savingCaptionId, setSavingCaptionId] = useState<string | null>(null);

	// Refs
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Track which media are being polled to avoid duplicate polling
	const pollingRef = useRef<Set<string>>(new Set());

	// Effect: Resume monitoring for any media that's still generating when page loads
	useEffect(() => {
		const resumeGeneratingMedia = async () => {
			for (const scene of scenes) {
				// Check for generating images
				if (
					scene.imageId &&
					scene.imageStatus === "generating" &&
					!pollingRef.current.has(`image-${scene.imageId}`)
				) {
					pollingRef.current.add(`image-${scene.imageId}`);
					console.log(
						`[resumeGeneratingMedia] Resuming image polling for scene ${scene.id}`,
					);

					// Set UI state to show generating
					aistoryActions.updateScene(scene.id, { isLoading: true });

					// Start polling
					pollMediaUntilReady("image", scene.imageId, {
						pollInterval: 5000,
						maxAttempts: 120, // 10 minutes
					}).then((result) => {
						pollingRef.current.delete(`image-${scene.imageId}`);
						if (result.success && result.status === "completed") {
							aistoryActions.updateScene(scene.id, {
								imageUrl: result.imageUrl ?? undefined,
								imageStatus: "completed",
								isLoading: false,
							});
						} else {
							aistoryActions.updateScene(scene.id, {
								isLoading: false,
							});
							aistoryActions.setSceneError(
								result.error || "Image generation failed",
							);
						}
					});
				}

				// Check for generating videos
				if (
					scene.videoId &&
					scene.videoStatus === "generating" &&
					!pollingRef.current.has(`video-${scene.videoId}`)
				) {
					pollingRef.current.add(`video-${scene.videoId}`);
					console.log(
						`[resumeGeneratingMedia] Resuming video polling for scene ${scene.id}`,
					);

					// Set UI state to show generating
					aistoryActions.updateScene(scene.id, { isGeneratingVideo: true });

					// Start polling
					pollMediaUntilReady("video", scene.videoId, {
						pollInterval: 5000,
						maxAttempts: 120, // 10 minutes
					}).then((result) => {
						pollingRef.current.delete(`video-${scene.videoId}`);
						if (result.success && result.status === "completed") {
							aistoryActions.updateScene(scene.id, {
								videoUrl: result.videoUrl ?? undefined,
								videoDuration: result.duration ?? undefined,
								videoStatus: "completed",
								isGeneratingVideo: false,
							});
						} else {
							aistoryActions.updateScene(scene.id, {
								isGeneratingVideo: false,
								videoError: result.error || "Video generation failed",
							});
						}
					});
				}

				// Check for generating audio
				if (
					scene.audioId &&
					scene.audioStatus === "generating" &&
					!pollingRef.current.has(`audio-${scene.audioId}`)
				) {
					pollingRef.current.add(`audio-${scene.audioId}`);
					console.log(
						`[resumeGeneratingMedia] Resuming audio polling for scene ${scene.id}`,
					);

					// Set UI state to show generating
					aistoryActions.updateScene(scene.id, { isGeneratingAudio: true });

					// Start polling
					pollMediaUntilReady("audio", scene.audioId, {
						pollInterval: 5000,
						maxAttempts: 120, // 10 minutes
					}).then((result) => {
						pollingRef.current.delete(`audio-${scene.audioId}`);
						if (result.success && result.status === "completed") {
							aistoryActions.updateScene(scene.id, {
								audioUrl: result.audioUrl ?? undefined,
								audioDuration: result.duration ?? undefined,
								audioStatus: "completed",
								isGeneratingAudio: false,
							});
						} else {
							aistoryActions.updateScene(scene.id, {
								isGeneratingAudio: false,
							});
							aistoryActions.setSceneError(
								result.error || "Audio generation failed",
							);
						}
					});
				}
			}
		};

		resumeGeneratingMedia();
		// Only run on mount and when scenes change
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scenes.map((s) => `${s.id}-${s.imageStatus}-${s.videoStatus}-${s.audioStatus}`).join(",")]);

	// Handle character image upload: crop to 9:16 aspect ratio and upload to OpenAI
	const handleUploadCharacter = (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		if (!file) return;

		aistoryActions.setError(null);
		aistoryActions.setIsGeneratingCharacter(true);

		const reader = new FileReader();
		reader.onload = (e) => {
			const img = new Image();
			img.onload = async () => {
				// Calculate 9:16 crop region (center crop)
				const targetRatio = 9 / 16;
				const imgRatio = img.width / img.height;

				let cropWidth: number;
				let cropHeight: number;
				let cropX: number;
				let cropY: number;

				if (imgRatio > targetRatio) {
					cropHeight = img.height;
					cropWidth = cropHeight * targetRatio;
					cropX = (img.width - cropWidth) / 2;
					cropY = 0;
				} else {
					cropWidth = img.width;
					cropHeight = cropWidth / targetRatio;
					cropX = 0;
					cropY = (img.height - cropHeight) / 2;
				}

				// Use Canvas to crop and scale to target dimensions
				const canvas = document.createElement("canvas");
				canvas.width = 1024;
				canvas.height = 1536;
				const ctx = canvas.getContext("2d");

				if (ctx) {
					ctx.drawImage(
						img,
						cropX,
						cropY,
						cropWidth,
						cropHeight,
						0,
						0,
						1024,
						1536,
					);

					const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
					aistoryActions.setCharacterImage(base64);

					uploadCharacterMutation.mutate(base64, {
						onSuccess: (result) => {
							if (result.success && result.fileId) {
								aistoryActions.setCharacterFileId(result.fileId);
							} else {
								aistoryActions.setError(
									result.error ?? "Failed to upload character image",
								);
							}
							aistoryActions.setIsGeneratingCharacter(false);
						},
						onError: (err) => {
							aistoryActions.setError(
								err instanceof Error
									? err.message
									: "Failed to upload character image",
							);
							aistoryActions.setIsGeneratingCharacter(false);
						},
					});
				} else {
					aistoryActions.setIsGeneratingCharacter(false);
				}
			};
			img.src = e.target?.result as string;
		};
		reader.readAsDataURL(file);

		event.target.value = "";
	};

	// Handle character generation from prompt
	const handleGenerateCharacter = () => {
		if (!characterPrompt?.trim() || !storyId) return;

		aistoryActions.setIsGeneratingCharacter(true);
		aistoryActions.setError(null);

		generateCharacterMutation.mutate(
			{ prompt: characterPrompt, storyId, imageEngine, imageStyle },
			{
				onSuccess: (result) => {
					if (result.success && result.imageId && result.imageUrl) {
						// Store the image ID and Supabase Storage URL
						aistoryActions.setCharacterImageId(result.imageId);
						aistoryActions.setCharacterImageUrl(result.imageUrl);
						// GPT Image returns fileId (OpenAI file_id for reference)
						if (result.fileId) {
							aistoryActions.setCharacterFileId(result.fileId);
						}
						// Flux Pro returns falImageUrl (FAL storage URL for video generation)
						if (result.falImageUrl) {
							aistoryActions.setCharacterFalImageUrl(result.falImageUrl);
						}
					} else {
						aistoryActions.setError(
							result.error || "Failed to generate character image",
						);
					}
					aistoryActions.setIsGeneratingCharacter(false);
				},
				onError: (err) => {
					aistoryActions.setError(
						err instanceof Error ? err.message : "An unexpected error occurred",
					);
					aistoryActions.setIsGeneratingCharacter(false);
				},
			},
		);
	};

	// Update character prompt
	const handleUpdateCharacterPrompt = (newPrompt: string) => {
		aistoryActions.setCharacterPrompt(newPrompt);
	};

	// Update scene prompt (editable)
	const handleUpdateScenePrompt = (sceneId: string, newPrompt: string) => {
		aistoryActions.updateScene(sceneId, { prompt: newPrompt });
	};

	// Update scene caption (editable) - local state only
	const handleUpdateSceneCaption = (sceneId: string, newCaption: string) => {
		aistoryActions.updateScene(sceneId, { caption: newCaption });
	};

	// Save scene caption to database
	const handleSaveSceneCaption = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene) return;

		setSavingCaptionId(sceneId);

		updateSceneCaptionMutation.mutate(
			{ sceneId, caption: scene.caption },
			{
				onSuccess: (result) => {
					if (result.success) {
						setSavedCaptions((prev) => ({ ...prev, [sceneId]: scene.caption }));
					} else {
						aistoryActions.setSceneError(
							result.error || "Failed to save caption",
						);
					}
					setSavingCaptionId(null);
				},
				onError: (err) => {
					aistoryActions.setSceneError(
						err instanceof Error ? err.message : "Failed to save caption",
					);
					setSavingCaptionId(null);
				},
			},
		);
	};

	// Check if caption has unsaved changes
	const hasCaptionChanged = (sceneId: string, currentCaption: string) => {
		const lastSaved = savedCaptions[sceneId];
		// If never saved locally, we don't know if it differs from DB
		// So we show the save button to allow explicit save
		if (lastSaved === undefined) return true;
		return lastSaved !== currentCaption;
	};

	// Update scene video instruction (editable)
	const handleUpdateSceneVideoPrompt = (
		sceneId: string,
		newVideoPrompt: string,
	) => {
		aistoryActions.updateScene(sceneId, { video_prompt: newVideoPrompt });
	};

	// Handle single scene image generation
	const handleGenerateSceneImage = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene || !storyId) return;

		aistoryActions.updateScene(sceneId, { isLoading: true });

		generateSceneImageMutation.mutate(
			{
				prompt: scene.prompt,
				storyId,
				sceneId,
				isCharacter: scene.isCharacter,
				// GPT Image uses characterFileId (OpenAI file_id)
				characterFileId:
					imageEngine === "gpt-image" && scene.isCharacter
						? (characterFileId ?? undefined)
						: undefined,
				// Flux Pro uses characterImageUrl (FAL storage URL) for image-to-image with kontext/max
				characterImageUrl:
					imageEngine === "flux-pro" && scene.isCharacter
						? (characterImageUrl ?? undefined)
						: undefined,
				imageEngine,
			},
			{
				onSuccess: (result) => {
					if (result.success && result.imageId && result.imageUrl) {
						aistoryActions.updateScene(sceneId, {
							imageId: result.imageId,
							imageUrl: result.imageUrl,
							isLoading: false,
						});
					} else {
						aistoryActions.updateScene(sceneId, { isLoading: false });
						aistoryActions.setSceneError(
							result.error || "Failed to generate scene image",
						);
					}
				},
				onError: (err) => {
					aistoryActions.updateScene(sceneId, { isLoading: false });
					aistoryActions.setSceneError(
						err instanceof Error ? err.message : "An unexpected error occurred",
					);
				},
			},
		);
	};

	// Handle single scene audio generation using ElevenLabs with word timestamps
	const handleGenerateSceneAudio = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene || !storyId) return;

		aistoryActions.updateScene(sceneId, { isGeneratingAudio: true });

		generateSceneAudioMutation.mutate(
			{ caption: scene.caption, storyId, sceneId, voiceId },
			{
				onSuccess: (result) => {
					if (result.success && result.audioId && result.audioUrl) {
						aistoryActions.updateScene(sceneId, {
							audioId: result.audioId,
							audioUrl: result.audioUrl,
							audioDuration: result.audioDuration,
							wordTimestamps: result.wordTimestamps,
							isGeneratingAudio: false,
						});
					} else {
						aistoryActions.updateScene(sceneId, { isGeneratingAudio: false });
						aistoryActions.setSceneError(
							result.error || "Failed to generate scene audio",
						);
					}
				},
				onError: (err) => {
					aistoryActions.updateScene(sceneId, { isGeneratingAudio: false });
					aistoryActions.setSceneError(
						err instanceof Error ? err.message : "An unexpected error occurred",
					);
				},
			},
		);
	};

	// Handle single scene video generation using FAL-AI Kling video model
	// Using async/await with mutateAsync to avoid callback override when multiple mutations run concurrently
	const handleGenerateSceneVideo = async (sceneId: string) => {
		console.log(`[handleGenerateSceneVideo] Starting for sceneId: ${sceneId}`);
		const scene = scenes.find((s) => s.id === sceneId);
		if (
			!scene ||
			!storyId ||
			!scene.imageUrl ||
			!scene.audioDuration ||
			!scene.imageId ||
			!scene.audioId
		)
			return;

		aistoryActions.updateScene(sceneId, {
			isGeneratingVideo: true,
			videoError: null,
		});

		try {
			const result = await generateSceneVideoMutation.mutateAsync({
				storyId,
				sceneId,
				videoPrompt: scene.video_prompt,
				imageUrl: scene.imageUrl,
				audioDuration: scene.audioDuration,
				imageId: scene.imageId,
				audioId: scene.audioId,
				videoEngine,
				onStatusUpdate: (status) => {
					console.log(`[video] Scene ${sceneId} status: ${status}`);
				},
			});

			console.log(`[video:${sceneId}] Result:`, result);

			if (result.success && result.videoId && result.videoUrl) {
				console.log(`[video:${sceneId}] Updating scene with video:`, {
					videoId: result.videoId,
					videoUrl: result.videoUrl,
				});
				aistoryActions.updateScene(sceneId, {
					videoId: result.videoId,
					videoUrl: result.videoUrl,
					videoDuration: result.videoDuration,
					isGeneratingVideo: false,
					videoError: null,
				});
			} else {
				console.log(`[video:${sceneId}] Missing data:`, {
					success: result.success,
					videoId: result.videoId,
					videoUrl: result.videoUrl,
				});
				aistoryActions.updateScene(sceneId, {
					isGeneratingVideo: false,
					videoError: result.error || "Failed to generate scene video",
				});
			}
		} catch (err) {
			console.error(`[video:${sceneId}] Error:`, err);
			aistoryActions.updateScene(sceneId, {
				isGeneratingVideo: false,
				videoError:
					err instanceof Error ? err.message : "An unexpected error occurred",
			});
		}
	};

	// Play scene audio with word-by-word caption synchronization
	const handlePlaySceneAudio = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene?.audioUrl) return;

		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current = null;
		}

		const audio = new Audio(scene.audioUrl);
		audioRef.current = audio;

		aistoryActions.setPlayingSceneId(sceneId);
		setCurrentWordIndex(scene.wordTimestamps?.length ? 0 : null);

		if (scene.wordTimestamps?.length) {
			audio.addEventListener("timeupdate", () => {
				const currentTime = audio.currentTime;
				const idx =
					scene.wordTimestamps?.findIndex(
						(wt) => currentTime >= wt.startTime && currentTime < wt.endTime,
					) ?? -1;

				if (idx !== -1) {
					setCurrentWordIndex(idx);
				}
			});
		}

		audio.addEventListener("ended", () => {
			aistoryActions.setPlayingSceneId(null);
			setCurrentWordIndex(null);
			audioRef.current = null;
		});

		audio.play();
	};

	// Download scene audio as mp3 file
	const handleDownloadAudio = (sceneId: string, sceneTitle: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene?.audioUrl) return;

		// For URLs, we need to fetch and create a blob
		fetch(scene.audioUrl)
			.then((res) => res.blob())
			.then((blob) => {
				const url = URL.createObjectURL(blob);
				const link = document.createElement("a");
				link.href = url;
				link.download = `${sceneTitle.replace(/[^a-zA-Z0-9]/g, "_")}.mp3`;
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				URL.revokeObjectURL(url);
			});
	};

	// Check if scene editing should be disabled (no character image)
	const scenesDisabled = !characterImageUrl;

	// Check if all scenes have videos generated (for export button)
	const allScenesHaveVideos =
		scenes.length > 0 &&
		scenes.every((scene) => scene.videoUrl && scene.audioUrl);

	// Handle download exported video
	const handleDownloadExportedVideo = async () => {
		if (!exportedVideoUrl) return;

		try {
			const response = await fetch(exportedVideoUrl);
			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = blobUrl;
			link.download = `shorty_film_${Date.now()}.mp4`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(blobUrl);
		} catch (error) {
			console.error("Download failed:", error);
		}
	};

	return (
		<div className="space-y-8">
			{/* Hidden file upload input */}
			<input
				type="file"
				ref={fileInputRef}
				onChange={handleUploadCharacter}
				accept="image/*"
				className="hidden"
			/>

			{/* Engine Settings Display */}
			<div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
				<div className="flex items-center justify-between">
					<div>
						<h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wide">
							Engine Settings
						</h3>
						<div className="flex flex-wrap gap-3">
							<div className="px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/30 rounded-lg">
								<span className="text-xs text-cyan-400 font-medium">
									Image: {imageEngine === "flux-pro" ? "Flux Pro" : "GPT Image"}
								</span>
							</div>
							<div className="px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg">
								<span className="text-xs text-amber-400 font-medium">
									Style: {imageStyle.charAt(0).toUpperCase() + imageStyle.slice(1).replace("-", " ")}
								</span>
							</div>
							<div className="px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded-lg">
								<span className="text-xs text-purple-400 font-medium">
									Video:{" "}
									{videoEngine.includes("kling")
										? videoEngine.includes("no-audio")
											? "Kling (No Audio)"
											: videoEngine.includes("reference")
											? "Kling Reference"
											: "Kling v2.6"
										: "LTX-2"}
								</span>
							</div>
						</div>
					</div>

					{/* Exported Video Download Link */}
					{exportedVideoUrl && (
						<button
							type="button"
							onClick={handleDownloadExportedVideo}
							className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-colors"
						>
							<Download className="w-4 h-4 text-emerald-400" />
							<span className="text-sm text-emerald-400 font-medium">
								Download Exported Video
							</span>
						</button>
					)}
				</div>
			</div>

			{/* Character Card */}
			<div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
				<h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
					<User className="w-5 h-5 text-cyan-400" />
					Character
				</h3>

				<div className="flex gap-6">
					{/* Left side: prompt textarea + buttons */}
					<div className="flex-1 min-w-0">
						<textarea
							value={characterPrompt || ""}
							onChange={(e) => handleUpdateCharacterPrompt(e.target.value)}
							className="w-full h-40 px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors resize-none"
							disabled={isGeneratingCharacter}
							placeholder="Character description prompt..."
						/>

						{/* Character generation button group */}
						<div className="mt-3 flex gap-3">
							<button
								type="button"
								onClick={handleGenerateCharacter}
								disabled={!characterPrompt?.trim() || isGeneratingCharacter}
								className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 shadow-md shadow-cyan-500/20 hover:shadow-cyan-500/40 disabled:shadow-none flex items-center justify-center gap-2"
							>
								{isGeneratingCharacter ? (
									<>
										<Loader2 className="w-5 h-5 animate-spin" />
										Generating...
									</>
								) : (
									<>
										<ImageIcon className="w-5 h-5" />
										GENERATE CHARACTER
									</>
								)}
							</button>
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								disabled={isGeneratingCharacter}
								className="flex-1 py-3 bg-gradient-to-r from-slate-600 to-slate-500 hover:from-slate-500 hover:to-slate-400 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 shadow-md shadow-slate-500/20 hover:shadow-slate-500/40 disabled:shadow-none flex items-center justify-center gap-2"
							>
								<Upload className="w-5 h-5" />
								UPLOAD CHARACTER
							</button>
						</div>
					</div>

					{/* Right side: character image preview */}
					<div className="w-48 flex-shrink-0">
						{characterImageUrl ? (
							<img
								src={characterImageUrl}
								alt="Character portrait"
								className="w-full rounded-lg shadow-lg object-cover"
								style={{ aspectRatio: "9/16" }}
							/>
						) : (
							<div
								className="w-full bg-slate-900/50 border border-slate-600 rounded-lg flex items-center justify-center text-slate-500"
								style={{ aspectRatio: "9/16" }}
							>
								<div className="text-center p-4">
									<ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
									<span className="text-xs">9:16 Preview</span>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Scene error message */}
			{sceneError && (
				<div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300">
					{sceneError}
				</div>
			)}

			{/* Scene card list */}
			{scenes.length > 0 && (
				<div className="space-y-6">
					{/* Disabled overlay message */}
					{scenesDisabled && (
						<div className="p-4 bg-amber-500/20 border border-amber-500/50 rounded-xl text-amber-300 text-center">
							Please generate or upload a character image first to enable scene
							editing
						</div>
					)}

					{scenes.map((scene, index) => (
						<div
							key={scene.id}
							className={`bg-slate-800/50 border border-slate-700 rounded-xl p-6 ${
								scenesDisabled ? "opacity-50 pointer-events-none" : ""
							}`}
						>
							{/* Scene header with controls */}
							<div className="flex items-center justify-between mb-4">
								<h3 className="text-lg font-semibold text-white flex items-center gap-2">
									<Clapperboard className="w-5 h-5 text-purple-400" />
									Scene {index + 1}: {scene.title}
								</h3>
								<div className="flex items-center gap-3">
									{/* isCharacter toggle */}
									<label className="flex items-center gap-2 cursor-pointer">
										<input
											type="checkbox"
											checked={scene.isCharacter}
											onChange={() =>
												aistoryActions.updateScene(scene.id, {
													isCharacter: !scene.isCharacter,
												})
											}
											className="w-4 h-4 accent-cyan-500"
											disabled={scene.isLoading || scenesDisabled}
										/>
										<span className="text-sm text-slate-300">Character</span>
									</label>
									{/* Reorder buttons */}
									<div className="flex items-center gap-1">
										<button
											type="button"
											onClick={() =>
												aistoryActions.reorderScenes(index, index - 1)
											}
											disabled={index === 0 || scenesDisabled}
											className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
											title="Move up"
										>
											<ChevronUp className="w-4 h-4" />
										</button>
										<button
											type="button"
											onClick={() =>
												aistoryActions.reorderScenes(index, index + 1)
											}
											disabled={index === scenes.length - 1 || scenesDisabled}
											className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
											title="Move down"
										>
											<ChevronDown className="w-4 h-4" />
										</button>
									</div>
									{/* Delete button */}
									<button
										type="button"
										onClick={() => aistoryActions.deleteScene(scene.id)}
										disabled={scenes.length <= 1 || scenesDisabled}
										className="p-1 text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
										title="Delete scene"
									>
										<Trash2 className="w-4 h-4" />
									</button>
								</div>
							</div>

							{/* Two-column layout: left textarea + buttons, right image */}
							<div className="flex gap-6">
								{/* Left side: prompt editor + generate button + Caption + audio button */}
								<div className="flex-1 min-w-0">
									<textarea
										value={scene.prompt}
										onChange={(e) =>
											handleUpdateScenePrompt(scene.id, e.target.value)
										}
										className="w-full h-40 px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors resize-none"
										disabled={scene.isLoading || scenesDisabled}
									/>
									{/* Progress bar for image generation (1 minute) */}
									<CountdownProgress
										isActive={scene.isLoading ?? false}
										durationSeconds={60}
									/>
									{/* Image generation button */}
									<button
										type="button"
										onClick={() => handleGenerateSceneImage(scene.id)}
										disabled={
											!scene.prompt.trim() || scene.isLoading || scenesDisabled
										}
										className={`${scene.isLoading ? "" : "mt-3"} w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 shadow-md shadow-purple-500/20 hover:shadow-purple-500/40 disabled:shadow-none flex items-center justify-center gap-2`}
									>
										{scene.isLoading ? (
											<>
												<Loader2 className="w-5 h-5 animate-spin" />
												Generating Image...
											</>
										) : (
											<>
												<ImageIcon className="w-5 h-5" />
												{scene.imageUrl
													? "REGENERATE IMAGE"
													: "GENERATE SCENE IMAGE"}
											</>
										)}
									</button>
									{/* Caption editor */}
									<div className="mt-3">
										<div className="flex items-center justify-between">
											<span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
												Caption
											</span>
											<button
												type="button"
												onClick={() => handleSaveSceneCaption(scene.id)}
												disabled={
													savingCaptionId === scene.id ||
													!scene.caption.trim() ||
													scenesDisabled
												}
												className={`px-3 py-1 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1 ${
													!hasCaptionChanged(scene.id, scene.caption)
														? "bg-emerald-500/20 text-emerald-400 cursor-default"
														: "bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white"
												} disabled:opacity-50 disabled:cursor-not-allowed`}
												title={
													!hasCaptionChanged(scene.id, scene.caption)
														? "Caption saved"
														: "Save caption to database"
												}
											>
												{savingCaptionId === scene.id ? (
													<>
														<Loader2 className="w-3 h-3 animate-spin" />
														Saving...
													</>
												) : !hasCaptionChanged(scene.id, scene.caption) ? (
													<>
														<Check className="w-3 h-3" />
														Saved
													</>
												) : (
													<>
														<Save className="w-3 h-3" />
														Save
													</>
												)}
											</button>
										</div>
										<textarea
											value={scene.caption}
											onChange={(e) =>
												handleUpdateSceneCaption(scene.id, e.target.value)
											}
											className="mt-1 w-full h-20 px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-none"
											disabled={scene.isGeneratingAudio || scenesDisabled}
											placeholder="Enter caption text..."
										/>
									</div>
									{/* Audio generation button */}
									<div className="mt-3">
										<button
											type="button"
											onClick={() => handleGenerateSceneAudio(scene.id)}
											disabled={
												!scene.caption.trim() ||
												scene.isGeneratingAudio ||
												scenesDisabled
											}
											className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40 disabled:shadow-none flex items-center justify-center gap-2"
										>
											{scene.isGeneratingAudio ? (
												<>
													<Loader2 className="w-5 h-5 animate-spin" />
													Generating Audio...
												</>
											) : (
												<>
													<Volume2 className="w-5 h-5" />
													{scene.audioUrl
														? "REGENERATE AUDIO"
														: "GENERATE SCENE AUDIO"}
												</>
											)}
										</button>
									</div>

									{/* Video instruction + generate video button */}
									<div className="mt-3">
										<div className="p-3 bg-slate-900/30 border border-slate-700 rounded-lg">
											<span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
												Video instruction
											</span>
											<textarea
												value={scene.video_prompt ?? ""}
												onChange={(e) =>
													handleUpdateSceneVideoPrompt(scene.id, e.target.value)
												}
												className="mt-2 w-full h-28 px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
												placeholder="Describe how this still image should be animated (camera movement, acting, natural effects)..."
												disabled={
													scene.isLoading ||
													scene.isGeneratingAudio ||
													scene.isGeneratingVideo ||
													scenesDisabled
												}
											/>
										</div>
										{/* Video generation error message */}
										{scene.videoError && (
											<div className="mt-2 p-2 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
												{scene.videoError}
											</div>
										)}
										{/* Progress bar for video generation (3 minutes) */}
										<CountdownProgress
											isActive={scene.isGeneratingVideo ?? false}
											durationSeconds={180}
										/>
										<button
											type="button"
											onClick={() => handleGenerateSceneVideo(scene.id)}
											disabled={
												!scene.video_prompt?.trim() ||
												!scene.imageUrl ||
												!scene.audioDuration ||
												scene.isGeneratingVideo ||
												scenesDisabled
											}
											title={
												!scene.audioDuration
													? "Generate audio first to enable video generation"
													: undefined
											}
											className={`${scene.isGeneratingVideo ? "" : "mt-3"} w-full py-3 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/40 disabled:shadow-none flex items-center justify-center gap-2`}
										>
											{scene.isGeneratingVideo ? (
												<>
													<Loader2 className="w-5 h-5 animate-spin" />
													Generating Video...
												</>
											) : (
												<>
													<Film className="w-5 h-5" />
													{scene.videoError
														? "RETRY VIDEO"
														: scene.videoUrl
															? "REGENERATE VIDEO"
															: "GENERATE VIDEO"}
												</>
											)}
										</button>
									</div>
								</div>

								{/* Right side: generated scene image + Duration + play button */}
								<div className="w-48 flex-shrink-0">
									{/* Image area (with caption overlay) */}
									<div className="relative">
										{scene.imageUrl ? (
											<>
												<img
													src={scene.imageUrl}
													alt={`Scene: ${scene.title}`}
													className="w-full rounded-lg shadow-lg object-cover"
													style={{ aspectRatio: "9/16" }}
												/>
												{/* Caption overlay during playback - shows one word at a time */}
												{playingSceneId === scene.id &&
													scene.wordTimestamps &&
													currentWordIndex !== null && (
														<div className="absolute inset-0 flex items-center justify-center rounded-lg">
															<p className="text-white text-center text-2xl font-bold px-3 py-2 mx-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
																{scene.wordTimestamps[currentWordIndex]?.word ||
																	""}
															</p>
														</div>
													)}
												{/* Fallback: show full caption if no word timestamps */}
												{playingSceneId === scene.id &&
													!scene.wordTimestamps && (
														<div className="absolute inset-0 flex items-center justify-center rounded-lg">
															<p className="text-white text-center text-sm font-medium px-3 py-2 mx-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
																{scene.caption}
															</p>
														</div>
													)}
											</>
										) : (
											<div
												className="w-full bg-slate-900/50 border border-slate-600 rounded-lg flex items-center justify-center text-slate-500"
												style={{ aspectRatio: "9/16" }}
											>
												<div className="text-center p-4">
													<ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
													<span className="text-xs">9:16 Preview</span>
												</div>
											</div>
										)}
									</div>
									{/* Duration, play button, and download button */}
									<div className="mt-2 flex items-center justify-between text-sm">
										<span className="text-slate-400">
											{scene.audioDuration
												? `${scene.audioDuration.toFixed(1)}s`
												: "--"}
										</span>
										{scene.audioUrl && (
											<div className="flex items-center gap-1">
												<button
													type="button"
													onClick={() => handlePlaySceneAudio(scene.id)}
													disabled={scenesDisabled}
													className={`p-2 rounded-full transition-colors ${
														playingSceneId === scene.id
															? "bg-emerald-500 text-white"
															: "bg-slate-700 text-slate-300 hover:bg-slate-600"
													}`}
													title="Play audio"
												>
													<Play className="w-4 h-4" />
												</button>
												<button
													type="button"
													onClick={() =>
														handleDownloadAudio(scene.id, scene.title)
													}
													className="p-2 rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
													title="Download audio"
												>
													<Download className="w-4 h-4" />
												</button>
											</div>
										)}
									</div>
									{/* Video preview area */}
									<div className="mt-3">
										{scene.videoUrl ? (
											<>
												<video
													src={scene.videoUrl}
													controls
													className="w-full rounded-lg shadow-lg"
													style={{ aspectRatio: "9/16" }}
												>
													<track kind="captions" />
													Your browser does not support video playback.
												</video>
												<div className="mt-1 text-xs text-slate-400 text-center">
													Video: {scene.videoDuration?.toFixed(1)}s
												</div>
											</>
										) : (
											<div
												className="w-full bg-slate-900/50 border border-slate-600 rounded-lg flex items-center justify-center text-slate-500"
												style={{ aspectRatio: "9/16" }}
											>
												<div className="text-center p-4">
													<Film className="w-8 h-8 mx-auto mb-2 opacity-50" />
													<span className="text-xs">Video Preview</span>
												</div>
											</div>
										)}
									</div>
								</div>
							</div>
						</div>
					))}

					{/* Add Scene Button */}
					<button
						type="button"
						onClick={() => aistoryActions.addScene()}
						disabled={scenesDisabled}
						className="w-full py-4 border-2 border-dashed border-slate-600 hover:border-purple-500 rounded-xl text-slate-400 hover:text-purple-400 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<Plus className="w-5 h-5" />
						Add New Scene
					</button>
				</div>
			)}

			{/* Go to Export Button - shown when all scenes have videos */}
			{allScenesHaveVideos && (
				<div className="mt-8">
					<button
						type="button"
						onClick={() => navigate({ to: "/aistory/export" })}
						className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 flex items-center justify-center gap-3"
					>
						<Film className="w-6 h-6" />
						GO TO EXPORT
					</button>
				</div>
			)}
		</div>
	);
}
