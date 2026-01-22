import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import {
	Captions,
	ChevronDown,
	ChevronUp,
	Clapperboard,
	Download,
	Film,
	FolderOpen,
	ImageIcon,
	Loader2,
	Play,
	Plus,
	Settings,
	Trash2,
	Upload,
	User,
	Volume2,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { AssetPickerModal } from "@/components/asset-picker-modal";
import { CountdownProgress } from "@/components/countdown-progress";
import { ErrorWithRetry, InlineError } from "@/components/error-with-retry";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	pollMediaUntilReady,
	useGenerateCharacter,
	useGenerateSceneAudio,
	useGenerateSceneImage,
	useGenerateSceneVideo,
	useReorderScenes,
	useUpdateSceneCaption,
	useUpdateScenePrompt,
	useUpdateSceneVoice,
	useUpdateStorySettings,
	useUploadCharacter,
} from "@/hooks/use-aistory-api";
import { authFetch } from "@/hooks/use-auth";
import {
	aistoryActions,
	aistoryStore,
	type ImageEngine,
	type VideoEngine,
	type VoiceId,
} from "@/stores/aistory.store";
import {
	generationQueueActions,
	generationQueueStore,
} from "@/stores/generation-queue.store";

// Image engine options
const IMAGE_ENGINES: { id: ImageEngine; label: string }[] = [
	{ id: "flux-pro", label: "Flux Pro" },
	{ id: "gpt-image-1.5", label: "GPT Image 1.5" },
	{ id: "nano-banana-pro", label: "Nano Banana Pro" },
	{ id: "nano-banana", label: "Nano Banana" },
];

// Video engine options
const VIDEO_ENGINES: { id: VideoEngine; label: string }[] = [
	{ id: "kling-video", label: "Kling v2.6 Pro" },
	{ id: "kling-video-v2.5-turbo", label: "Kling v2.5 Turbo" },
	{ id: "sora-2", label: "Sora 2" },
	{ id: "ltx-2-19b", label: "LTX-2 19B" },
	{ id: "veo3.1", label: "Veo 3.1" },
	{ id: "veo3.1-fast", label: "Veo 3.1 Fast" },
];

// Voice options
const VOICE_OPTIONS: { id: VoiceId; label: string }[] = [
	{ id: "PIGsltMj3gFMR34aFDI3", label: "Jonathan" },
	{ id: "Z3R5wn05IrDiVCyEkUrK", label: "Arabella" },
	{ id: "n1PvBOwxb8X6m7tahp2h", label: "Michael" },
	{ id: "ZF6FPAbjXT4488VcRRnw", label: "Amelia" },
	{ id: "ICwKbPHDHAM3eal5tHEZ", label: "Tony" },
	{ id: "cgLpYGyXZhkyalKZ0xeZ", label: "Knox" },
	{ id: "YKrm0N1EAM9Bw27j8kuD", label: "Leonidas" },
];

// Helper function to get video engine label
function getVideoEngineLabel(engine: VideoEngine): string {
	return VIDEO_ENGINES.find((e) => e.id === engine)?.label || engine;
}

// Queue indicator component
function QueueIndicator({
	sceneId,
	mediaType,
}: {
	sceneId: string;
	mediaType: "audio" | "image" | "video";
}) {
	const queueItems = useStore(generationQueueStore, (state) =>
		(state.queues[sceneId]?.[mediaType] || []).filter(
			(item) => item.status === "queued",
		),
	);

	if (queueItems.length === 0) return null;

	return (
		<div className="mt-2 space-y-1">
			{queueItems.map((item) => (
				<div
					key={item.id}
					className="flex items-center justify-between px-3 py-1.5 bg-muted rounded text-sm"
				>
					<span className="text-muted-foreground">
						Queue #{item.queuePosition}
					</span>
					<button
						type="button"
						onClick={() =>
							generationQueueActions.cancelQueued(sceneId, mediaType, item.id)
						}
						className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1"
					>
						<X className="w-3 h-3" />
						Cancel
					</button>
				</div>
			))}
		</div>
	);
}

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
	const updateScenePromptMutation = useUpdateScenePrompt();
	const updateSceneVoiceMutation = useUpdateSceneVoice();
	const updateStorySettingsMutation = useUpdateStorySettings();
	const reorderScenesMutation = useReorderScenes();

	// Debounced callback for saving scene prompts (1.5 second delay)
	const debouncedSavePrompt = useDebouncedCallback(
		(sceneId: string, prompt?: string, videoPrompt?: string) => {
			updateScenePromptMutation.mutate(
				{ sceneId, prompt, videoPrompt },
				{
					onError: (err) => {
						console.error("Failed to save prompt:", err);
						// Don't show error to user - silent save
					},
				},
			);
		},
		1500, // 1.5 seconds
	);

	// Debounced callback for saving scene caption (1.5 second delay)
	const debouncedSaveCaption = useDebouncedCallback(
		(sceneId: string, caption: string) => {
			updateSceneCaptionMutation.mutate(
				{ sceneId, caption },
				{
					onError: (err) => {
						console.error("Failed to save caption:", err);
						// Don't show error to user - silent save
					},
				},
			);
		},
		1500, // 1.5 seconds
	);

	// Debounced callback for saving scene order (1.5 second delay)
	const debouncedSaveOrder = useDebouncedCallback(
		(sceneOrder: Array<{ sceneId: string; orderIndex: number }>) => {
			const currentStoryId = aistoryStore.state.storyId;
			if (!currentStoryId) return;

			reorderScenesMutation.mutate(
				{ storyId: currentStoryId, sceneOrder },
				{
					onError: (err) => {
						console.error("Failed to save scene order:", err);
						// Don't show error to user - silent save
					},
				},
			);
		},
		1500, // 1.5 seconds
	);

	// Subscribe to store state
	const characterPrompt = useStore(
		aistoryStore,
		(state) => state.characterPrompt,
	);
	const characterImageUrl = useStore(
		aistoryStore,
		(state) => state.characterImageUrl,
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
	const llmEngine = useStore(aistoryStore, (state) => state.llmEngine);
	const storyId = useStore(aistoryStore, (state) => state.storyId);

	// Default voice ID (Jonathan) - used when scene doesn't have voiceId set
	const DEFAULT_VOICE_ID: VoiceId = "PIGsltMj3gFMR34aFDI3";
	const exportedVideoUrl = useStore(
		aistoryStore,
		(state) => state.exportedVideoUrl,
	);

	// Batch generation state
	const isGeneratingAllImages = useStore(
		aistoryStore,
		(state) => state.isGeneratingAllImages,
	);
	const isGeneratingAllVideos = useStore(
		aistoryStore,
		(state) => state.isGeneratingAllVideos,
	);
	const batchImageProgress = useStore(
		aistoryStore,
		(state) => state.batchImageProgress,
	);
	const batchVideoProgress = useStore(
		aistoryStore,
		(state) => state.batchVideoProgress,
	);

	// Computed: scenes that need images (no imageId OR imageStatus !== 'completed')
	const scenesNeedingImages = scenes.filter(
		(scene) =>
			!scene.imageId ||
			(scene.imageStatus !== "completed" && scene.imageStatus !== undefined),
	);
	const pendingImageCount = scenesNeedingImages.length;

	// Computed: check if ALL images are completed (required for video generation)
	const allImagesCompleted = scenes.every(
		(scene) =>
			scene.imageId &&
			(scene.imageStatus === "completed" || scene.imageStatus === undefined),
	);

	// Computed: scenes that need videos (has image + audio but no video)
	const scenesNeedingVideos = scenes.filter(
		(scene) =>
			(!scene.videoId ||
				(scene.videoStatus !== "completed" &&
					scene.videoStatus !== undefined)) &&
			scene.imageId &&
			(scene.imageStatus === "completed" || scene.imageStatus === undefined) &&
			scene.audioId &&
			(scene.audioStatus === "completed" || scene.audioStatus === undefined),
	);
	const pendingVideoCount = scenesNeedingVideos.length;

	// State for word-by-word caption display during audio playback
	const [currentWordIndex, setCurrentWordIndex] = useState<number | null>(null);

	// State for asset picker modal and upload dropdown
	const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
	const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);

	// State for settings panel expansion
	const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);

	// Refs
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const uploadMenuRef = useRef<HTMLDivElement>(null);

	// Track which media are being polled to avoid duplicate polling
	const pollingRef = useRef<Set<string>>(new Set());

	// Effect: Close upload menu when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				uploadMenuRef.current &&
				!uploadMenuRef.current.contains(event.target as Node)
			) {
				setIsUploadMenuOpen(false);
			}
		};

		if (isUploadMenuOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isUploadMenuOpen]);

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
	}, [
		scenes
			.map((s) => `${s.id}-${s.imageStatus}-${s.videoStatus}-${s.audioStatus}`)
			.join(","),
	]);

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

					uploadCharacterMutation.mutate(
						{
							imageBase64: base64,
							storyId: storyId ?? undefined,
							person: "character",
						},
						{
							onSuccess: (result) => {
								if (result.success && result.imageId && result.imageUrl) {
									aistoryActions.setCharacterImageId(result.imageId);
									aistoryActions.setCharacterImageUrl(result.imageUrl);
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
						},
					);
				} else {
					aistoryActions.setIsGeneratingCharacter(false);
				}
			};
			img.src = e.target?.result as string;
		};
		reader.readAsDataURL(file);

		event.target.value = "";
	};

	// Handle import character from asset library
	const handleImportFromAssets = async (imageUrl: string, imageId: string) => {
		aistoryActions.setError(null);
		aistoryActions.setIsGeneratingCharacter(true);

		if (!storyId) {
			aistoryActions.setError("Story ID is required");
			aistoryActions.setIsGeneratingCharacter(false);
			return;
		}

		try {
			// Use link-character endpoint to directly link existing image to story
			const linkResponse = await authFetch("/api/link-character", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					imageId,
					storyId,
					person: "character",
				}),
			});

			if (!linkResponse.ok) {
				const errorData = await linkResponse.json();
				throw new Error(errorData.error || "Failed to link character image");
			}

			const linkResult = await linkResponse.json();
			if (!linkResult.success) {
				throw new Error(linkResult.error || "Failed to link character image");
			}

			// Update store with the linked image
			aistoryActions.setCharacterImageId(imageId);
			aistoryActions.setCharacterImageUrl(linkResult.imageUrl || imageUrl);
			aistoryActions.setIsGeneratingCharacter(false);
		} catch (err) {
			aistoryActions.setError(
				err instanceof Error ? err.message : "Failed to import from assets",
			);
			aistoryActions.setIsGeneratingCharacter(false);
		}
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
						// Store the image ID and Supabase Storage URL (used by all FAL engines)
						aistoryActions.setCharacterImageId(result.imageId);
						aistoryActions.setCharacterImageUrl(result.imageUrl);
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

	// Update scene prompt (editable) - updates local state immediately and debounce saves to database
	const handleUpdateScenePrompt = (sceneId: string, newPrompt: string) => {
		// 1. Immediately update local state for responsive UI
		aistoryActions.updateScene(sceneId, { prompt: newPrompt });
		// 2. Debounce save to database
		debouncedSavePrompt(sceneId, newPrompt, undefined);
	};

	// Update scene caption (editable) - updates local state immediately and debounce saves to database
	const handleUpdateSceneCaption = (sceneId: string, newCaption: string) => {
		// 1. Immediately update local state for responsive UI
		aistoryActions.updateScene(sceneId, { caption: newCaption });
		// 2. Debounce save to database
		debouncedSaveCaption(sceneId, newCaption);
	};

	// Update scene voice settings and persist to database
	const handleUpdateSceneVoice = (
		sceneId: string,
		voiceId?: VoiceId,
		voiceSpeed?: number,
	) => {
		// Update local store immediately
		const updates: { voiceId?: VoiceId; voiceSpeed?: number } = {};
		if (voiceId !== undefined) updates.voiceId = voiceId;
		if (voiceSpeed !== undefined) updates.voiceSpeed = voiceSpeed;
		aistoryActions.updateScene(sceneId, updates);

		// Persist to database
		updateSceneVoiceMutation.mutate(
			{ sceneId, voiceId, voiceSpeed },
			{
				onError: (err) => {
					console.error("Failed to save voice settings:", err);
					// Don't revert local state - let user try again
				},
			},
		);
	};

	// Update scene video instruction (editable) - updates local state immediately and debounce saves to database
	const handleUpdateSceneVideoPrompt = (
		sceneId: string,
		newVideoPrompt: string,
	) => {
		// 1. Immediately update local state for responsive UI
		aistoryActions.updateScene(sceneId, { video_prompt: newVideoPrompt });
		// 2. Debounce save to database
		debouncedSavePrompt(sceneId, undefined, newVideoPrompt);
	};

	// Handle scene reorder - updates local state immediately and debounce saves to database
	const handleReorderScenes = (fromIndex: number, toIndex: number) => {
		// 1. Immediately update local state for responsive UI
		aistoryActions.reorderScenes(fromIndex, toIndex);

		// 2. Get the new order from store after reorder and debounce save
		// Need to use setTimeout to ensure store is updated first
		setTimeout(() => {
			const currentScenes = aistoryStore.state.scenes;
			const sceneOrder = currentScenes.map((scene, index) => ({
				sceneId: scene.id,
				orderIndex: index,
			}));
			debouncedSaveOrder(sceneOrder);
		}, 0);
	};

	// Process image generation (internal function called by queue)
	const processImageGeneration = async (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene || !storyId) {
			generationQueueActions.completeAndNext(sceneId, "image");
			return;
		}

		aistoryActions.updateScene(sceneId, { isLoading: true });

		try {
			const result = await generateSceneImageMutation.mutateAsync({
				prompt: scene.prompt,
				storyId,
				sceneId,
				isCharacter: scene.isCharacter,
				characterImageUrl: scene.isCharacter
					? (characterImageUrl ?? undefined)
					: undefined,
				imageEngine,
			});

			if (result.success && result.imageId && result.imageUrl) {
				aistoryActions.updateScene(sceneId, {
					imageId: result.imageId,
					imageUrl: result.imageUrl,
					imageStatus: "completed",
					isLoading: false,
				});
			} else {
				aistoryActions.updateScene(sceneId, { isLoading: false });
				aistoryActions.setSceneError(
					result.error || "Failed to generate scene image",
				);
			}
		} catch (err) {
			aistoryActions.updateScene(sceneId, { isLoading: false });
			aistoryActions.setSceneError(
				err instanceof Error ? err.message : "An unexpected error occurred",
			);
		}

		// Process next in queue
		const nextItem = generationQueueActions.completeAndNext(sceneId, "image");
		if (nextItem) {
			processImageGeneration(sceneId);
		}
	};

	// Handle single scene image generation with queue support
	const handleGenerateSceneImage = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene || !storyId) return;

		// Add to queue
		generationQueueActions.enqueue(sceneId, "image");

		// Check if we need to start processing (queue length was 0 before enqueue, now 1)
		const queueLength = generationQueueActions.getQueueLength(sceneId, "image");
		if (queueLength === 1) {
			processImageGeneration(sceneId);
		}
		// If queue length > 1, request is queued and will be processed when current completes
	};

	// Process audio generation (internal function called by queue)
	const processAudioGeneration = async (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene || !storyId) {
			generationQueueActions.completeAndNext(sceneId, "audio");
			return;
		}

		aistoryActions.updateScene(sceneId, { isGeneratingAudio: true });

		// Use scene-level voiceId/voiceSpeed if set, otherwise fall back to default voice
		const sceneVoiceId = scene.voiceId || DEFAULT_VOICE_ID;
		const sceneVoiceSpeed = Number(scene.voiceSpeed) || 1.0;

		try {
			const result = await generateSceneAudioMutation.mutateAsync({
				caption: scene.caption,
				storyId,
				sceneId,
				voiceId: sceneVoiceId,
				voiceSpeed: sceneVoiceSpeed,
			});

			if (result.success && result.audioId && result.audioUrl) {
				aistoryActions.updateScene(sceneId, {
					audioId: result.audioId,
					audioUrl: result.audioUrl,
					audioDuration: result.audioDuration,
					wordTimestamps: result.wordTimestamps,
					audioStatus: "completed",
					isGeneratingAudio: false,
				});
			} else {
				aistoryActions.updateScene(sceneId, { isGeneratingAudio: false });
				aistoryActions.setSceneError(
					result.error || "Failed to generate scene audio",
				);
			}
		} catch (err) {
			aistoryActions.updateScene(sceneId, { isGeneratingAudio: false });
			aistoryActions.setSceneError(
				err instanceof Error ? err.message : "An unexpected error occurred",
			);
		}

		// Process next in queue
		const nextItem = generationQueueActions.completeAndNext(sceneId, "audio");
		if (nextItem) {
			processAudioGeneration(sceneId);
		}
	};

	// Handle single scene audio generation with queue support
	const handleGenerateSceneAudio = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene || !storyId) return;

		// Add to queue
		generationQueueActions.enqueue(sceneId, "audio");

		// Check if we need to start processing
		const queueLength = generationQueueActions.getQueueLength(sceneId, "audio");
		if (queueLength === 1) {
			processAudioGeneration(sceneId);
		}
	};

	// Process video generation (internal function called by queue)
	const processVideoGeneration = async (sceneId: string) => {
		console.log(`[processVideoGeneration] Starting for sceneId: ${sceneId}`);
		const scene = scenes.find((s) => s.id === sceneId);
		if (
			!scene ||
			!storyId ||
			!scene.imageUrl ||
			!scene.audioUrl ||
			!scene.audioDuration ||
			!scene.imageId ||
			!scene.audioId
		) {
			generationQueueActions.completeAndNext(sceneId, "video");
			return;
		}

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
				audioUrl: scene.audioUrl,
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
					videoStatus: "completed",
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

		// Process next in queue
		const nextItem = generationQueueActions.completeAndNext(sceneId, "video");
		if (nextItem) {
			processVideoGeneration(sceneId);
		}
	};

	// Handle single scene video generation with queue support
	const handleGenerateSceneVideo = async (sceneId: string) => {
		console.log(`[handleGenerateSceneVideo] Starting for sceneId: ${sceneId}`);
		const scene = scenes.find((s) => s.id === sceneId);
		if (
			!scene ||
			!storyId ||
			!scene.imageUrl ||
			!scene.audioUrl ||
			!scene.audioDuration ||
			!scene.imageId ||
			!scene.audioId
		)
			return;

		// Add to queue
		generationQueueActions.enqueue(sceneId, "video");

		// Check if we need to start processing
		const queueLength = generationQueueActions.getQueueLength(sceneId, "video");
		if (queueLength === 1) {
			processVideoGeneration(sceneId);
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

	// Check if any scene has word timestamps (for subtitle editor button)
	const hasAnyWordTimestamps = scenes.some(
		(scene) => scene.wordTimestamps && scene.wordTimestamps.length > 0,
	);

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

	// Handle batch generation of all images
	const handleGenerateAllImages = async () => {
		if (!storyId || !characterImageUrl) return;

		aistoryActions.setIsGeneratingAllImages(true);
		aistoryActions.setBatchImageProgress({
			current: 0,
			total: scenesNeedingImages.length,
		});

		for (let i = 0; i < scenesNeedingImages.length; i++) {
			const scene = scenesNeedingImages[i];
			aistoryActions.setBatchImageProgress({
				current: i + 1,
				total: scenesNeedingImages.length,
			});

			try {
				aistoryActions.updateScene(scene.id, { isLoading: true });

				const result = await generateSceneImageMutation.mutateAsync({
					prompt: scene.prompt,
					storyId,
					sceneId: scene.id,
					isCharacter: scene.isCharacter,
					characterImageUrl: scene.isCharacter ? characterImageUrl : undefined,
					imageEngine,
				});

				if (result.success && result.imageId && result.imageUrl) {
					aistoryActions.updateScene(scene.id, {
						imageId: result.imageId,
						imageUrl: result.imageUrl,
						imageStatus: "completed",
						isLoading: false,
					});
				} else {
					aistoryActions.updateScene(scene.id, { isLoading: false });
					console.error(
						`Image generation failed for scene ${scene.id}:`,
						result.error,
					);
				}
			} catch (err) {
				aistoryActions.updateScene(scene.id, { isLoading: false });
				console.error(`Image generation error for scene ${scene.id}:`, err);
			}
		}

		aistoryActions.setIsGeneratingAllImages(false);
		aistoryActions.setBatchImageProgress(null);
	};

	// Handle batch generation of all videos
	const handleGenerateAllVideos = async () => {
		if (!storyId || !allImagesCompleted) return;

		aistoryActions.setIsGeneratingAllVideos(true);
		aistoryActions.setBatchVideoProgress({
			current: 0,
			total: scenesNeedingVideos.length,
		});

		for (let i = 0; i < scenesNeedingVideos.length; i++) {
			const scene = scenesNeedingVideos[i];
			aistoryActions.setBatchVideoProgress({
				current: i + 1,
				total: scenesNeedingVideos.length,
			});

			if (
				!scene.imageUrl ||
				!scene.audioUrl ||
				!scene.audioDuration ||
				!scene.imageId ||
				!scene.audioId
			) {
				console.error(
					`Scene ${scene.id} missing required data for video generation`,
				);
				continue;
			}

			try {
				aistoryActions.updateScene(scene.id, {
					isGeneratingVideo: true,
					videoError: null,
				});

				const result = await generateSceneVideoMutation.mutateAsync({
					storyId,
					sceneId: scene.id,
					videoPrompt: scene.video_prompt,
					imageUrl: scene.imageUrl,
					audioUrl: scene.audioUrl,
					audioDuration: scene.audioDuration,
					imageId: scene.imageId,
					audioId: scene.audioId,
					videoEngine,
				});

				if (result.success && result.videoId && result.videoUrl) {
					aistoryActions.updateScene(scene.id, {
						videoId: result.videoId,
						videoUrl: result.videoUrl,
						videoDuration: result.videoDuration,
						videoStatus: "completed",
						isGeneratingVideo: false,
					});
				} else {
					aistoryActions.updateScene(scene.id, {
						isGeneratingVideo: false,
						videoError: result.error || "Failed to generate video",
					});
				}
			} catch (err) {
				aistoryActions.updateScene(scene.id, {
					isGeneratingVideo: false,
					videoError:
						err instanceof Error ? err.message : "Video generation failed",
				});
			}
		}

		aistoryActions.setIsGeneratingAllVideos(false);
		aistoryActions.setBatchVideoProgress(null);
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
			<Card>
				<CardContent className="p-4">
					{/* Header with toggle */}
					<div className="flex items-center justify-between">
						<button
							type="button"
							onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
							className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
						>
							<Settings className="w-4 h-4" />
							Engine Settings
							{isSettingsExpanded ? (
								<ChevronUp className="w-4 h-4" />
							) : (
								<ChevronDown className="w-4 h-4" />
							)}
						</button>

						{/* Exported Video Download Link */}
						{exportedVideoUrl && (
							<Button
								variant="outline"
								onClick={handleDownloadExportedVideo}
								className="flex items-center gap-2 bg-emerald-500/20 border-emerald-500/30 hover:bg-emerald-500/30"
							>
								<Download className="w-4 h-4 text-emerald-400" />
								<span className="text-sm text-emerald-400 font-medium">
									Download Exported Video
								</span>
							</Button>
						)}
					</div>

					{/* Summary tags (always visible) */}
					<div className="flex flex-wrap gap-2 mt-3">
						<div className="px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/30 rounded-lg">
							<span className="text-xs text-cyan-400 font-medium">
								Image:{" "}
								{IMAGE_ENGINES.find((e) => e.id === imageEngine)?.label ||
									imageEngine}
							</span>
						</div>
						<div className="px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg">
							<span className="text-xs text-amber-400 font-medium">
								Style:{" "}
								{imageStyle.charAt(0).toUpperCase() +
									imageStyle.slice(1).replace("-", " ")}
							</span>
						</div>
						<div className="px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded-lg">
							<span className="text-xs text-purple-400 font-medium">
								Video: {getVideoEngineLabel(videoEngine)}
							</span>
						</div>
						<div className="px-3 py-1.5 bg-muted border border-border rounded-lg">
							<span className="text-xs text-muted-foreground font-medium">
								LLM: {llmEngine === "gpt-4.1" ? "GPT-4.1" : "Claude Opus 4.5"}
							</span>
						</div>
					</div>

					{/* Expanded settings panel */}
					{isSettingsExpanded && (
						<div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4">
							{/* Image Engine (editable) */}
							<div>
								<label className="block text-xs text-muted-foreground mb-2 font-medium">
									Image Engine
								</label>
								<select
									value={imageEngine}
									onChange={(e) => {
										const newEngine = e.target.value as ImageEngine;
										aistoryActions.setImageEngine(newEngine);
										if (storyId) {
											updateStorySettingsMutation.mutate({
												storyId,
												imageEngine: newEngine,
											});
										}
									}}
									className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
								>
									{IMAGE_ENGINES.map((engine) => (
										<option key={engine.id} value={engine.id}>
											{engine.label}
										</option>
									))}
								</select>
							</div>

							{/* Video Engine (editable) */}
							<div>
								<label className="block text-xs text-muted-foreground mb-2 font-medium">
									Video Engine
								</label>
								<select
									value={videoEngine}
									onChange={(e) => {
										const newEngine = e.target.value as VideoEngine;
										aistoryActions.setVideoEngine(newEngine);
										if (storyId) {
											updateStorySettingsMutation.mutate({
												storyId,
												videoEngine: newEngine,
											});
										}
									}}
									className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
								>
									{VIDEO_ENGINES.map((engine) => (
										<option key={engine.id} value={engine.id}>
											{engine.label}
										</option>
									))}
								</select>
							</div>

							{/* Style (read-only) */}
							<div>
								<label className="block text-xs text-muted-foreground mb-2 font-medium">
									Style{" "}
									<span className="text-muted-foreground/70">
										(prompt-level)
									</span>
								</label>
								<div className="px-3 py-2 bg-muted border border-border rounded-lg text-muted-foreground text-sm">
									{imageStyle.charAt(0).toUpperCase() +
										imageStyle.slice(1).replace("-", " ")}
								</div>
							</div>

							{/* LLM Engine (read-only) */}
							<div>
								<label className="block text-xs text-muted-foreground mb-2 font-medium">
									LLM Engine{" "}
									<span className="text-muted-foreground/70">
										(prompt-level)
									</span>
								</label>
								<div className="px-3 py-2 bg-muted border border-border rounded-lg text-muted-foreground text-sm">
									{llmEngine === "gpt-4.1" ? "GPT-4.1" : "Claude Opus 4.5"}
								</div>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Character Card */}
			<Card>
				<CardContent className="p-6">
					<h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
						<User className="w-5 h-5 text-cyan-400" />
						Character
					</h3>

					<div className="flex gap-6">
						{/* Left side: prompt textarea + buttons */}
						<div className="flex-1 min-w-0">
							<textarea
								value={characterPrompt || ""}
								onChange={(e) => handleUpdateCharacterPrompt(e.target.value)}
								className="w-full h-40 px-4 py-3 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors resize-none"
								disabled={isGeneratingCharacter}
								placeholder="Character description prompt..."
							/>

							{/* Character generation button group */}
							<div className="mt-3 flex gap-3">
								<Button
									onClick={handleGenerateCharacter}
									disabled={!characterPrompt?.trim() || isGeneratingCharacter}
									className="flex-1 py-3 h-auto bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:from-muted disabled:to-muted disabled:cursor-not-allowed text-foreground font-semibold rounded-lg transition-all duration-300 shadow-md shadow-cyan-500/20 hover:shadow-cyan-500/40 disabled:shadow-none flex items-center justify-center gap-2"
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
								</Button>
								{/* Upload/Import dropdown */}
								<div ref={uploadMenuRef} className="relative flex-1">
									<Button
										variant="secondary"
										onClick={() => setIsUploadMenuOpen(!isUploadMenuOpen)}
										disabled={isGeneratingCharacter}
										className="w-full py-3 h-auto font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
									>
										<Upload className="w-5 h-5" />
										UPLOAD / IMPORT
										<ChevronDown className="w-4 h-4" />
									</Button>
									{isUploadMenuOpen && (
										<div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-10 overflow-hidden">
											<button
												type="button"
												onClick={() => {
													fileInputRef.current?.click();
													setIsUploadMenuOpen(false);
												}}
												className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-accent transition-colors flex items-center gap-3"
											>
												<Upload className="w-4 h-4 text-muted-foreground" />
												From Local File
											</button>
											<button
												type="button"
												onClick={() => {
													setIsAssetPickerOpen(true);
													setIsUploadMenuOpen(false);
												}}
												className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-accent transition-colors flex items-center gap-3 border-t border-border"
											>
												<FolderOpen className="w-4 h-4 text-purple-400" />
												From Asset Library
											</button>
										</div>
									)}
								</div>
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
									className="w-full bg-muted border border-border rounded-lg flex items-center justify-center text-muted-foreground"
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
				</CardContent>
			</Card>

			{/* Batch Generation Controls */}
			{scenes.length > 0 && !scenesDisabled && (
				<Card>
					<CardContent className="p-6">
						<h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
							<Settings className="w-5 h-5 text-amber-400" />
							Batch Generation
						</h3>

						<div className="grid grid-cols-2 gap-4">
							{/* Generate All Images Button */}
							<div>
								<Button
									onClick={handleGenerateAllImages}
									disabled={
										isGeneratingAllImages ||
										pendingImageCount === 0 ||
										!characterImageUrl
									}
									className="w-full py-3 h-auto bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-muted disabled:to-muted disabled:cursor-not-allowed text-foreground font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
								>
									{isGeneratingAllImages ? (
										<>
											<Loader2 className="w-5 h-5 animate-spin" />
											Generating Images ({batchImageProgress?.current || 0}/
											{batchImageProgress?.total || 0})
										</>
									) : (
										<>
											<ImageIcon className="w-5 h-5" />
											GENERATE ALL IMAGES
										</>
									)}
								</Button>
								<p className="mt-2 text-xs text-muted-foreground text-center">
									{pendingImageCount} scene(s) need images
								</p>
							</div>

							{/* Generate All Videos Button */}
							<div>
								<Button
									onClick={handleGenerateAllVideos}
									disabled={
										isGeneratingAllVideos ||
										!allImagesCompleted ||
										pendingVideoCount === 0
									}
									title={
										!allImagesCompleted
											? "All scene images must be completed first"
											: undefined
									}
									className="w-full py-3 h-auto bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 disabled:from-muted disabled:to-muted disabled:cursor-not-allowed text-foreground font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
								>
									{isGeneratingAllVideos ? (
										<>
											<Loader2 className="w-5 h-5 animate-spin" />
											Generating Videos ({batchVideoProgress?.current || 0}/
											{batchVideoProgress?.total || 0})
										</>
									) : (
										<>
											<Film className="w-5 h-5" />
											GENERATE ALL VIDEOS
										</>
									)}
								</Button>
								<p className="mt-2 text-xs text-muted-foreground text-center">
									{!allImagesCompleted
										? "Waiting for all images"
										: `${pendingVideoCount} scene(s) need videos`}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Scene error message with dismiss */}
			{sceneError && (
				<ErrorWithRetry
					error={sceneError.message}
					onDismiss={() => aistoryActions.setSceneError(null)}
					className="mb-4"
				/>
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
						<Card
							key={scene.id}
							className={scenesDisabled ? "opacity-50 pointer-events-none" : ""}
						>
							<CardContent className="p-6">
								{/* Scene header with controls */}
								<div className="flex items-center justify-between mb-4">
									<h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
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
											<span className="text-sm text-muted-foreground">
												Character
											</span>
										</label>
										{/* Reorder buttons */}
										<div className="flex items-center gap-1">
											<button
												type="button"
												onClick={() => handleReorderScenes(index, index - 1)}
												disabled={index === 0 || scenesDisabled}
												className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
												title="Move up"
											>
												<ChevronUp className="w-4 h-4" />
											</button>
											<button
												type="button"
												onClick={() => handleReorderScenes(index, index + 1)}
												disabled={index === scenes.length - 1 || scenesDisabled}
												className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
											className="w-full h-40 px-4 py-3 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors resize-none"
											disabled={scene.isLoading || scenesDisabled}
										/>
										{/* Progress bar for image generation (1 minute) */}
										<CountdownProgress
											isActive={scene.isLoading ?? false}
											durationSeconds={60}
										/>
										{/* Image generation button */}
										<Button
											onClick={() => handleGenerateSceneImage(scene.id)}
											disabled={
												!scene.prompt.trim() ||
												scene.isLoading ||
												scene.imageStatus === "generating" ||
												scenesDisabled
											}
											className={`${scene.isLoading || scene.imageStatus === "generating" ? "" : "mt-3"} w-full py-3 h-auto bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-muted disabled:to-muted disabled:cursor-not-allowed text-foreground font-semibold rounded-lg transition-all duration-300 shadow-md shadow-purple-500/20 hover:shadow-purple-500/40 disabled:shadow-none flex items-center justify-center gap-2`}
										>
											{scene.isLoading || scene.imageStatus === "generating" ? (
												<>
													<Loader2 className="w-5 h-5 animate-spin" />
													{scene.imageStatus === "generating"
														? "Resuming..."
														: "Generating Image..."}
												</>
											) : (
												<>
													<ImageIcon className="w-5 h-5" />
													{scene.imageUrl
														? "REGENERATE IMAGE"
														: "GENERATE SCENE IMAGE"}
												</>
											)}
										</Button>
										{/* Image generation queue indicator */}
										<QueueIndicator sceneId={scene.id} mediaType="image" />
										{/* Caption editor */}
										<div className="mt-3">
											<span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
												Caption
											</span>
											<textarea
												value={scene.caption}
												onChange={(e) =>
													handleUpdateSceneCaption(scene.id, e.target.value)
												}
												className="mt-1 w-full h-20 px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors resize-none"
												disabled={scene.isGeneratingAudio || scenesDisabled}
												placeholder="Enter caption text..."
											/>
										</div>
										{/* Per-scene voice settings */}
										<div className="mt-3 flex gap-3">
											{/* Voice selection */}
											<div className="flex-1">
												<label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
													Voice
												</label>
												<select
													value={scene.voiceId || DEFAULT_VOICE_ID}
													onChange={(e) =>
														handleUpdateSceneVoice(
															scene.id,
															e.target.value as VoiceId,
															undefined,
														)
													}
													disabled={scene.isGeneratingAudio || scenesDisabled}
													className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-50"
												>
													{VOICE_OPTIONS.map((voice) => (
														<option key={voice.id} value={voice.id}>
															{voice.label}
														</option>
													))}
												</select>
											</div>
											{/* Speed selection */}
											<div className="w-28">
												<label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
													Speed
												</label>
												<select
													value={scene.voiceSpeed ?? 1.0}
													onChange={(e) =>
														handleUpdateSceneVoice(
															scene.id,
															undefined,
															Number.parseFloat(e.target.value),
														)
													}
													disabled={scene.isGeneratingAudio || scenesDisabled}
													className="mt-1 w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors disabled:opacity-50"
												>
													<option value={0.7}>0.7x</option>
													<option value={0.8}>0.8x</option>
													<option value={0.9}>0.9x</option>
													<option value={1.0}>1.0x</option>
													<option value={1.1}>1.1x</option>
													<option value={1.2}>1.2x</option>
												</select>
											</div>
										</div>

										{/* Audio generation button */}
										<div className="mt-3">
											<Button
												onClick={() => handleGenerateSceneAudio(scene.id)}
												disabled={
													!scene.caption.trim() ||
													scene.isGeneratingAudio ||
													scene.audioStatus === "generating" ||
													scenesDisabled
												}
												className="w-full py-3 h-auto bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:from-muted disabled:to-muted disabled:cursor-not-allowed text-foreground font-semibold rounded-lg transition-all duration-300 shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40 disabled:shadow-none flex items-center justify-center gap-2"
											>
												{scene.isGeneratingAudio ||
												scene.audioStatus === "generating" ? (
													<>
														<Loader2 className="w-5 h-5 animate-spin" />
														{scene.audioStatus === "generating"
															? "Resuming..."
															: "Generating Audio..."}
													</>
												) : (
													<>
														<Volume2 className="w-5 h-5" />
														{scene.audioUrl
															? "REGENERATE AUDIO"
															: "GENERATE SCENE AUDIO"}
													</>
												)}
											</Button>
											{/* Audio generation queue indicator */}
											<QueueIndicator sceneId={scene.id} mediaType="audio" />
										</div>

										{/* Video instruction + generate video button */}
										<div className="mt-3">
											<div className="p-3 bg-muted border border-border rounded-lg">
												<span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
													Video instruction
												</span>
												<textarea
													value={scene.video_prompt ?? ""}
													onChange={(e) =>
														handleUpdateSceneVideoPrompt(
															scene.id,
															e.target.value,
														)
													}
													className="mt-2 w-full h-28 px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none"
													placeholder="Describe how this still image should be animated (camera movement, acting, natural effects)..."
													disabled={
														scene.isLoading ||
														scene.isGeneratingAudio ||
														scene.isGeneratingVideo ||
														scenesDisabled
													}
												/>
											</div>
											{/* Video generation error message with retry */}
											{scene.videoError && (
												<InlineError
													error={scene.videoError}
													onRetry={() => handleGenerateSceneVideo(scene.id)}
													onDismiss={() =>
														aistoryActions.updateScene(scene.id, {
															videoError: null,
														})
													}
													isRetrying={scene.isGeneratingVideo}
												/>
											)}
											{/* Progress bar for video generation (3 minutes) */}
											<CountdownProgress
												isActive={scene.isGeneratingVideo ?? false}
												durationSeconds={180}
											/>
											<Button
												onClick={() => handleGenerateSceneVideo(scene.id)}
												disabled={
													!scene.video_prompt?.trim() ||
													!scene.imageUrl ||
													!scene.audioDuration ||
													scene.isGeneratingVideo ||
													scene.videoStatus === "generating" ||
													scenesDisabled
												}
												title={
													!scene.audioDuration
														? "Generate audio first to enable video generation"
														: undefined
												}
												className={`${scene.isGeneratingVideo || scene.videoStatus === "generating" ? "" : "mt-3"} w-full py-3 h-auto bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 disabled:from-muted disabled:to-muted disabled:cursor-not-allowed text-foreground font-semibold rounded-lg transition-all duration-300 shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/40 disabled:shadow-none flex items-center justify-center gap-2`}
											>
												{scene.isGeneratingVideo ||
												scene.videoStatus === "generating" ? (
													<>
														<Loader2 className="w-5 h-5 animate-spin" />
														{scene.videoStatus === "generating"
															? "Resuming..."
															: "Generating Video..."}
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
											</Button>
											{/* Video generation queue indicator */}
											<QueueIndicator sceneId={scene.id} mediaType="video" />
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
																<p className="text-foreground text-center text-2xl font-bold px-3 py-2 mx-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
																	{scene.wordTimestamps[currentWordIndex]
																		?.word || ""}
																</p>
															</div>
														)}
													{/* Fallback: show full caption if no word timestamps */}
													{playingSceneId === scene.id &&
														!scene.wordTimestamps && (
															<div className="absolute inset-0 flex items-center justify-center rounded-lg">
																<p className="text-foreground text-center text-sm font-medium px-3 py-2 mx-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
																	{scene.caption}
																</p>
															</div>
														)}
												</>
											) : (
												<div
													className="w-full bg-muted border border-border rounded-lg flex items-center justify-center text-muted-foreground"
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
											<span className="text-muted-foreground">
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
																? "bg-emerald-500 text-foreground"
																: "bg-muted text-muted-foreground hover:bg-accent"
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
														className="p-2 rounded-full bg-muted text-muted-foreground hover:bg-accent transition-colors"
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
													<div className="mt-1 text-xs text-muted-foreground text-center">
														Video: {scene.videoDuration?.toFixed(1)}s
													</div>
												</>
											) : (
												<div
													className="w-full bg-muted border border-border rounded-lg flex items-center justify-center text-muted-foreground"
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
							</CardContent>
						</Card>
					))}

					{/* Add Scene Button */}
					<Button
						variant="outline"
						onClick={() => aistoryActions.addScene()}
						disabled={scenesDisabled}
						className="w-full py-4 h-auto border-2 border-dashed border-border hover:border-purple-500 rounded-xl text-muted-foreground hover:text-purple-400 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<Plus className="w-5 h-5" />
						Add New Scene
					</Button>
				</div>
			)}

			{/* Navigation Buttons */}
			{(hasAnyWordTimestamps || allScenesHaveVideos) && (
				<div className="mt-8 flex flex-col gap-3">
					{/* Go to Subtitles Button - shown when any scene has word timestamps */}
					{hasAnyWordTimestamps && (
						<Button
							onClick={() => navigate({ to: "/aistory/subtitles" })}
							variant="outline"
							className="w-full py-4 h-auto border-2 border-cyan-500/50 hover:border-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-lg font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-3"
						>
							<Captions className="w-6 h-6" />
							編輯字幕
						</Button>
					)}

					{/* Go to Export Button - shown when all scenes have videos */}
					{allScenesHaveVideos && (
						<Button
							onClick={() => navigate({ to: "/aistory/export" })}
							className="w-full py-4 h-auto bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-foreground text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 flex items-center justify-center gap-3"
						>
							<Film className="w-6 h-6" />
							GO TO EXPORT
						</Button>
					)}
				</div>
			)}

			{/* Asset Picker Modal */}
			<AssetPickerModal
				isOpen={isAssetPickerOpen}
				onClose={() => setIsAssetPickerOpen(false)}
				onSelect={handleImportFromAssets}
				title="Select Character Image"
			/>
		</div>
	);
}
