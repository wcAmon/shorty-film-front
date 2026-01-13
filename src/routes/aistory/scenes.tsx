import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import {
	ChevronDown,
	ChevronUp,
	Clapperboard,
	Download,
	Film,
	ImageIcon,
	Loader2,
	Play,
	Plus,
	Trash2,
	Upload,
	User,
	Volume2,
} from "lucide-react";
import { useRef, useState } from "react";
import { CountdownProgress } from "@/components/countdown-progress";
import {
	useGenerateCharacter,
	useGenerateSceneAudio,
	useGenerateSceneImage,
	useGenerateSceneVideo,
	useUploadCharacter,
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

	// Subscribe to store state
	const characterPrompt = useStore(
		aistoryStore,
		(state) => state.characterPrompt,
	);
	const characterImage = useStore(
		aistoryStore,
		(state) => state.characterImage,
	);
	const characterFileId = useStore(
		aistoryStore,
		(state) => state.characterFileId,
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
	const characterImageUrl = useStore(
		aistoryStore,
		(state) => state.characterImageUrl,
	);
	const voiceId = useStore(aistoryStore, (state) => state.voiceId);
	const storyId = useStore(aistoryStore, (state) => state.storyId);

	// State for word-by-word caption display during audio playback
	const [currentWordIndex, setCurrentWordIndex] = useState<number | null>(null);

	// Refs
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

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
					if (result.success && result.imageBase64) {
						aistoryActions.setCharacterImage(result.imageBase64);
						// GPT Image returns fileId (OpenAI file_id)
						if (result.fileId) {
							aistoryActions.setCharacterFileId(result.fileId);
						}
						// Flux Pro returns imageUrl (FAL storage URL)
						if (result.imageUrl) {
							aistoryActions.setCharacterImageUrl(result.imageUrl);
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

	// Update scene caption (editable)
	const handleUpdateSceneCaption = (sceneId: string, newCaption: string) => {
		aistoryActions.updateScene(sceneId, { caption: newCaption });
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
		const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
		if (!scene || sceneIndex === -1 || !storyId) return;

		aistoryActions.updateScene(sceneId, { isLoading: true });

		generateSceneImageMutation.mutate(
			{
				prompt: scene.prompt,
				storyId,
				sceneIndex,
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
					if (result.success && result.imageBase64) {
						aistoryActions.updateScene(sceneId, {
							imageBase64: result.imageBase64,
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
		const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
		if (!scene || sceneIndex === -1 || !storyId) return;

		aistoryActions.updateScene(sceneId, { isGeneratingAudio: true });

		generateSceneAudioMutation.mutate(
			{ caption: scene.caption, storyId, sceneIndex, voiceId },
			{
				onSuccess: (result) => {
					if (result.success && result.audioBase64) {
						aistoryActions.updateScene(sceneId, {
							audioBase64: result.audioBase64,
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

	// Handle single scene video generation using FAL-AI Kling video model (with polling)
	const handleGenerateSceneVideo = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
		if (!scene || sceneIndex === -1 || !storyId || !scene.imageBase64 || !scene.audioDuration) return;

		aistoryActions.updateScene(sceneId, {
			isGeneratingVideo: true,
			videoError: null,
		});

		generateSceneVideoMutation.mutate(
			{
				storyId,
				sceneIndex,
				videoPrompt: scene.video_prompt,
				imageBase64: scene.imageBase64,
				audioDuration: scene.audioDuration,
				videoEngine, // Pass selected video engine
				onStatusUpdate: (status) => {
					console.log(`[video] Scene ${sceneId} status: ${status}`);
				},
			},
			{
				onSuccess: (result) => {
					if (result.success && result.videoBase64) {
						aistoryActions.updateScene(sceneId, {
							videoBase64: result.videoBase64,
							videoDuration: result.videoDuration,
							isGeneratingVideo: false,
							videoError: null,
						});
					} else {
						aistoryActions.updateScene(sceneId, {
							isGeneratingVideo: false,
							videoError: result.error || "Failed to generate scene video",
						});
					}
				},
				onError: (err) => {
					aistoryActions.updateScene(sceneId, {
						isGeneratingVideo: false,
						videoError:
							err instanceof Error
								? err.message
								: "An unexpected error occurred",
					});
				},
			},
		);
	};

	// Play scene audio with word-by-word caption synchronization
	const handlePlaySceneAudio = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene?.audioBase64) return;

		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current = null;
		}

		const audio = new Audio(`data:audio/mp3;base64,${scene.audioBase64}`);
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
		if (!scene?.audioBase64) return;

		const link = document.createElement("a");
		link.href = `data:audio/mp3;base64,${scene.audioBase64}`;
		link.download = `${sceneTitle.replace(/[^a-zA-Z0-9]/g, "_")}.mp3`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	// Check if scene editing should be disabled (no character image)
	const scenesDisabled = !characterImage;

	// Check if all scenes have videos generated (for export button)
	const allScenesHaveVideos =
		scenes.length > 0 &&
		scenes.every((scene) => scene.videoBase64 && scene.audioBase64);

	// Navigate to export page
	const handleExportMyVideo = () => {
		navigate({ to: "/aistory/export" });
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
						{characterImage ? (
							<img
								src={`data:image/jpeg;base64,${characterImage}`}
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
												GENERATE SCENE IMAGE
											</>
										)}
									</button>
									{/* Caption editor */}
									<div className="mt-3">
										<span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
											Caption
										</span>
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
													GENERATE SCENE AUDIO
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
												!scene.imageBase64 ||
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
													{scene.videoError ? "RETRY VIDEO" : "GENERATE VIDEO"}
												</>
											)}
										</button>
									</div>
								</div>

								{/* Right side: generated scene image + Duration + play button */}
								<div className="w-48 flex-shrink-0">
									{/* Image area (with caption overlay) */}
									<div className="relative">
										{scene.imageBase64 ? (
											<>
												<img
													src={`data:image/jpeg;base64,${scene.imageBase64}`}
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
										{scene.audioBase64 && (
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
										{scene.videoBase64 ? (
											<>
												<video
													src={`data:video/mp4;base64,${scene.videoBase64}`}
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

			{/* Export My Video Button - shown when all scenes have videos */}
			{allScenesHaveVideos && (
				<div className="mt-8">
					<button
						type="button"
						onClick={handleExportMyVideo}
						className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 flex items-center justify-center gap-3"
					>
						<Film className="w-6 h-6" />
						EXPORT MY VIDEO
					</button>
				</div>
			)}
		</div>
	);
}
