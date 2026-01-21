import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { AssetPickerModal } from "@/components/asset-picker-modal";
import { CountdownProgress } from "@/components/countdown-progress";
import { DirectorAssistant } from "@/components/director-assistant/DirectorAssistant";
import { ErrorWithRetry, InlineError } from "@/components/error-with-retry";
import {
	useCreateDirectorStory,
	useGenerateDirectorCharacter,
	useGenerateDirectorSceneAudio,
	useGenerateDirectorSceneImage,
	useGenerateDirectorSceneVideo,
	useGenerateDirectorAvatarVideo,
	useReorderDirectorScenes,
	useUpdateDirectorScene,
	useUpdateStoryTitle,
	useUploadDirectorCharacter,
} from "@/hooks/use-director-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	directorActions,
	directorStore,
	type DirectorAvatarEngine,
	type DirectorCaptionLanguage,
	type DirectorImageEngine,
	type DirectorImageStyle,
	type DirectorSceneState,
	type DirectorVideoEngine,
	type DirectorVoiceId,
} from "@/stores/director.store";

// ============================================================================
// Options
// ============================================================================

const IMAGE_STYLES: { id: DirectorImageStyle; label: string; description: string }[] = [
	{ id: "cinematic", label: "Cinematic", description: "Realistic film still look with natural lighting" },
	{ id: "comic", label: "Comic", description: "1950s American comic style (pulp print)" },
	{ id: "low-poly", label: "Low-Poly", description: "Oil-paint diorama with low-poly statues" },
	{ id: "japanese-anime", label: "Japanese Anime", description: "Classic 90s hand-drawn anime/manga look" },
	{ id: "clay", label: "Clay", description: "Claymation style with handcrafted miniature diorama feel" },
];

const IMAGE_ENGINES: { id: DirectorImageEngine; label: string; description?: string }[] = [
	{ id: "flux-pro", label: "Flux Pro", description: "Fast, high quality images (recommended)" },
	{ id: "gpt-image-1.5", label: "GPT Image 1.5", description: "OpenAI GPT-Image via FAL AI, with character consistency" },
	{ id: "nano-banana-pro", label: "Nano Banana Pro", description: "Fast character-consistent generation with reference support" },
];

const VIDEO_ENGINES: { id: DirectorVideoEngine; label: string; description?: string }[] = [
	{ id: "kling-video", label: "Kling v2.6 Pro", description: "Direct image animation, better quality (recommended)" },
	{ id: "sora-2", label: "Sora 2", description: "OpenAI Sora 2 via FAL AI, high quality video generation" },
	{ id: "ltx-2-19b", label: "LTX-2 19B", description: "Fast generation with good motion quality" },
	{ id: "veo3.1", label: "Veo 3.1", description: "Google Veo 3.1 via FAL AI, high quality with audio generation" },
	{ id: "veo3.1-fast", label: "Veo 3.1 Fast", description: "Faster Veo 3.1 generation, good for testing" },
];

const AVATAR_ENGINES: { id: DirectorAvatarEngine; label: string; description?: string }[] = [
	{ id: "omnihuman", label: "Omnihuman", description: "High quality talking head generation (recommended)" },
	{ id: "aurora", label: "Aurora", description: "Fast avatar video generation" },
];

const VOICE_OPTIONS: { id: DirectorVoiceId; label: string; description?: string }[] = [
	{ id: "PIGsltMj3gFMR34aFDI3", label: "Jonathan", description: "Male, warm and engaging storyteller voice" },
	{ id: "Z3R5wn05IrDiVCyEkUrK", label: "Arabella", description: "Female, elegant and expressive narration" },
	{ id: "n1PvBOwxb8X6m7tahp2h", label: "Michael", description: "Male, deep and authoritative voice" },
	{ id: "ZF6FPAbjXT4488VcRRnw", label: "Amelia", description: "Female, friendly and natural conversational tone" },
	{ id: "ICwKbPHDHAM3eal5tHEZ", label: "Tony", description: "Male, New York accent with street-smart vibe" },
	{ id: "cgLpYGyXZhkyalKZ0xeZ", label: "Knox", description: "Male, hype-man sincere voice" },
	{ id: "YKrm0N1EAM9Bw27j8kuD", label: "Leonidas", description: "Male, legendary Spartan warrior voice" },
];

const CAPTION_LANGUAGES: { id: DirectorCaptionLanguage; label: string }[] = [
	{ id: "en", label: "English" },
	{ id: "zh-TW", label: "繁體中文" },
];

// ============================================================================
// Route
// ============================================================================

export const Route = createFileRoute("/director-mode/")({
	component: DirectorModePage,
});

// ============================================================================
// Main Component
// ============================================================================

function DirectorModePage() {
	const navigate = useNavigate();

	// React Query mutations
	const createStoryMutation = useCreateDirectorStory();
	const generateCharacterMutation = useGenerateDirectorCharacter();
	const uploadCharacterMutation = useUploadDirectorCharacter();
	const generateSceneImageMutation = useGenerateDirectorSceneImage();
	const generateSceneAudioMutation = useGenerateDirectorSceneAudio();
	const generateSceneVideoMutation = useGenerateDirectorSceneVideo();
	const generateAvatarVideoMutation = useGenerateDirectorAvatarVideo();
	const updateSceneMutation = useUpdateDirectorScene();
	const reorderScenesMutation = useReorderDirectorScenes();
	const updateTitleMutation = useUpdateStoryTitle();

	// Subscribe to store state
	const storyId = useStore(directorStore, (s) => s.storyId);
	const title = useStore(directorStore, (s) => s.title);
	const defaultImageEngine = useStore(directorStore, (s) => s.defaultImageEngine);
	const defaultImageStyle = useStore(directorStore, (s) => s.defaultImageStyle);
	const defaultVideoEngine = useStore(directorStore, (s) => s.defaultVideoEngine);
	const defaultAvatarEngine = useStore(directorStore, (s) => s.defaultAvatarEngine);
	const defaultVoiceId = useStore(directorStore, (s) => s.defaultVoiceId);
	const defaultVoiceSpeed = useStore(directorStore, (s) => s.defaultVoiceSpeed);
	const captionLanguage = useStore(directorStore, (s) => s.captionLanguage);
	const character = useStore(directorStore, (s) => s.character);
	const scenes = useStore(directorStore, (s) => s.scenes);
	const error = useStore(directorStore, (s) => s.error);
	const sceneError = useStore(directorStore, (s) => s.sceneError);
	const playingSceneId = useStore(directorStore, (s) => s.playingSceneId);
	const exportedVideoUrl = useStore(directorStore, (s) => s.exportedVideoUrl);
	const isGeneratingAllImages = useStore(directorStore, (s) => s.isGeneratingAllImages);
	const isGeneratingAllAudios = useStore(directorStore, (s) => s.isGeneratingAllAudios);
	const isGeneratingAllVideos = useStore(directorStore, (s) => s.isGeneratingAllVideos);
	const batchProgress = useStore(directorStore, (s) => s.batchProgress);

	// Local state
	const [characterPrompt, setCharacterPrompt] = useState(character?.imagePrompt || "");
	const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);
	const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
	const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
	const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
	const [expandedSceneSettings, setExpandedSceneSettings] = useState<Set<string>>(new Set());
	const [isCreatingStory, setIsCreatingStory] = useState(false);

	// Refs
	const fileInputRef = useRef<HTMLInputElement>(null);
	const uploadMenuRef = useRef<HTMLDivElement>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	// Effect: Auto-create story when page loads without a storyId
	useEffect(() => {
		if (!storyId && !isCreatingStory && !createStoryMutation.isPending) {
			setIsCreatingStory(true);
			createStoryMutation.mutate(
				{
					imageEngine: defaultImageEngine,
					imageStyle: defaultImageStyle,
					voiceId: defaultVoiceId,
					videoEngine: defaultVideoEngine,
				},
				{
					onSuccess: (result) => {
						if (result.success && result.storyId) {
							directorActions.setStoryId(result.storyId);
							console.log(`[director-mode] Created new story: ${result.storyId}`);
						} else {
							console.error("[director-mode] Failed to create story:", result.error);
							directorActions.setError(new Error(result.error || "Failed to create story"));
						}
						setIsCreatingStory(false);
					},
					onError: (err) => {
						console.error("[director-mode] Error creating story:", err);
						directorActions.setError(err instanceof Error ? err : new Error("Failed to create story"));
						setIsCreatingStory(false);
					},
				},
			);
		}
	}, [storyId, isCreatingStory, createStoryMutation, defaultImageEngine, defaultImageStyle, defaultVoiceId, defaultVideoEngine]);

	// Effect: Sync character prompt from store
	useEffect(() => {
		if (character?.imagePrompt) {
			setCharacterPrompt(character.imagePrompt);
		}
	}, [character?.imagePrompt]);

	// Effect: Close upload menu on outside click
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (uploadMenuRef.current && !uploadMenuRef.current.contains(event.target as Node)) {
				setIsUploadMenuOpen(false);
			}
		};
		if (isUploadMenuOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isUploadMenuOpen]);

	// Debounced save callbacks (1.5s delay)
	const debouncedSaveTitle = useDebouncedCallback((newTitle: string) => {
		if (storyId) {
			updateTitleMutation.mutate({ storyId, title: newTitle });
		}
	}, 1500);

	const debouncedSaveCaption = useDebouncedCallback((sceneId: string, caption: string) => {
		updateSceneMutation.mutate({ sceneId, updates: { caption } });
	}, 1500);

	const debouncedSaveImagePrompt = useDebouncedCallback((sceneId: string, imagePrompt: string) => {
		updateSceneMutation.mutate({ sceneId, updates: { imagePrompt } });
	}, 1500);

	const debouncedSaveVideoPrompt = useDebouncedCallback((sceneId: string, videoPrompt: string) => {
		updateSceneMutation.mutate({ sceneId, updates: { videoPrompt } });
	}, 1500);

	// Toggle scene settings
	const toggleSceneSettings = (sceneId: string) => {
		setExpandedSceneSettings((prev) => {
			const next = new Set(prev);
			if (next.has(sceneId)) {
				next.delete(sceneId);
			} else {
				next.add(sceneId);
			}
			return next;
		});
	};

	// Handle title change
	const handleTitleChange = (newTitle: string) => {
		directorActions.setTitle(newTitle);
		debouncedSaveTitle(newTitle);
	};

	// Handle field updates
	const handleCaptionChange = (sceneId: string, caption: string) => {
		directorActions.updateScene(sceneId, { caption });
		debouncedSaveCaption(sceneId, caption);
	};

	const handleImagePromptChange = (sceneId: string, imagePrompt: string) => {
		directorActions.updateScene(sceneId, { imagePrompt });
		debouncedSaveImagePrompt(sceneId, imagePrompt);
	};

	const handleVideoPromptChange = (sceneId: string, videoPrompt: string) => {
		directorActions.updateScene(sceneId, { videoPrompt });
		debouncedSaveVideoPrompt(sceneId, videoPrompt);
	};

	// Handle character generation
	const handleGenerateCharacter = async () => {
		if (!characterPrompt.trim() || !storyId) return;

		setIsGeneratingCharacter(true);
		directorActions.setError(null);

		generateCharacterMutation.mutate(
			{
				prompt: characterPrompt,
				storyId,
				imageEngine: defaultImageEngine,
				imageStyle: defaultImageStyle,
			},
			{
				onSuccess: (result) => {
					if (result.success && result.imageUrl) {
						directorActions.setCharacter({
							id: `char-${Date.now()}`,
							name: "Main Character",
							imagePrompt: characterPrompt,
							imageUrl: result.imageUrl,
							imageId: result.imageId || null,
							imageSource: "generate",
							imageEngine: defaultImageEngine,
							voiceId: defaultVoiceId,
							voiceSpeed: defaultVoiceSpeed,
							videoEngine: defaultVideoEngine,
							isGenerating: false,
							imageStatus: "completed",
						});
					} else {
						directorActions.setError(result.error || "Failed to generate character");
					}
					setIsGeneratingCharacter(false);
				},
				onError: (err) => {
					directorActions.setError(
						err instanceof Error ? err.message : "Failed to generate character",
					);
					setIsGeneratingCharacter(false);
				},
			},
		);
	};

	// Handle character upload from file
	const handleUploadCharacter = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file || !storyId) return;

		setIsGeneratingCharacter(true);
		directorActions.setError(null);

		const reader = new FileReader();
		reader.onload = (e) => {
			const base64 = (e.target?.result as string).split(",")[1];

			uploadCharacterMutation.mutate(
				{
					imageBase64: base64,
					storyId,
				},
				{
					onSuccess: (result) => {
						if (result.success && result.imageUrl) {
							directorActions.setCharacter({
								id: `char-${Date.now()}`,
								name: "Uploaded Character",
								imagePrompt: characterPrompt || "Uploaded character image",
								imageUrl: result.imageUrl,
								imageId: result.imageId || null,
								imageSource: "upload",
								imageEngine: defaultImageEngine,
								voiceId: defaultVoiceId,
								voiceSpeed: defaultVoiceSpeed,
								videoEngine: defaultVideoEngine,
								isGenerating: false,
								imageStatus: "completed",
							});
						} else {
							directorActions.setError(result.error || "Failed to upload character");
						}
						setIsGeneratingCharacter(false);
					},
					onError: (err) => {
						directorActions.setError(
							err instanceof Error ? err.message : "Failed to upload character",
						);
						setIsGeneratingCharacter(false);
					},
				},
			);
		};
		reader.readAsDataURL(file);
		event.target.value = "";
	};

	// Handle import from asset library
	const handleImportFromAssets = (imageUrl: string, imageId: string) => {
		directorActions.setCharacter({
			id: `char-${Date.now()}`,
			name: "Imported Character",
			imagePrompt: characterPrompt || "Imported from asset library",
			imageUrl,
			imageId,
			imageSource: "upload",
			imageEngine: defaultImageEngine,
			voiceId: defaultVoiceId,
			voiceSpeed: defaultVoiceSpeed,
			videoEngine: defaultVideoEngine,
			isGenerating: false,
			imageStatus: "completed",
		});
		setIsAssetPickerOpen(false);
	};

	// Scene-level engine changes
	const handleSceneImageEngineChange = (sceneId: string, engine: DirectorImageEngine) => {
		directorActions.updateScene(sceneId, { imageEngine: engine });
		updateSceneMutation.mutate({ sceneId, updates: { imageEngine: engine } });
	};

	const handleSceneVideoEngineChange = (sceneId: string, engine: DirectorVideoEngine) => {
		directorActions.updateScene(sceneId, { videoEngine: engine });
		updateSceneMutation.mutate({ sceneId, updates: { videoEngine: engine } });
	};

	const handleSceneAvatarEngineChange = (sceneId: string, engine: DirectorAvatarEngine | null) => {
		directorActions.updateScene(sceneId, { avatarEngine: engine });
		updateSceneMutation.mutate({ sceneId, updates: { avatarEngine: engine } });
	};

	const handleSceneVoiceChange = (sceneId: string, voiceId: DirectorVoiceId) => {
		directorActions.updateScene(sceneId, { voiceId });
		updateSceneMutation.mutate({ sceneId, updates: { voiceId } });
	};

	const handleSceneVoiceSpeedChange = (sceneId: string, speed: number) => {
		directorActions.updateScene(sceneId, { voiceSpeed: speed });
		updateSceneMutation.mutate({ sceneId, updates: { voiceSpeed: speed } });
	};

	const handleToggleAvatarMode = (sceneId: string, useAvatar: boolean) => {
		directorActions.updateScene(sceneId, {
			useAvatar,
			avatarEngine: useAvatar ? defaultAvatarEngine : null,
		});
		// Only persist avatarEngine to database - useAvatar is local UI state
		updateSceneMutation.mutate({
			sceneId,
			updates: {
				avatarEngine: useAvatar ? defaultAvatarEngine : null,
			},
		});
	};

	// Scene generation handlers
	const handleGenerateSceneImage = async (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene || !storyId) return;

		directorActions.updateScene(sceneId, {
			isGeneratingImage: true,
			imageStatus: "generating",
		});
		directorActions.setSceneError(null);

		try {
			const result = await generateSceneImageMutation.mutateAsync({
				sceneId,
				prompt: scene.imagePrompt,
				storyId,
				imageEngine: scene.useAvatar
					? (scene.avatarEngine || defaultAvatarEngine)
					: (scene.imageEngine || defaultImageEngine),
				characterImageUrl: character?.imageUrl || undefined,
			});

			if (result.success && result.imageUrl) {
				directorActions.updateScene(sceneId, {
					imageUrl: result.imageUrl,
					imageId: result.imageId || null,
					isGeneratingImage: false,
					imageStatus: "completed",
				});
			} else {
				directorActions.updateScene(sceneId, {
					isGeneratingImage: false,
					imageStatus: null,
				});
				directorActions.setSceneError(result.error || "Failed to generate image");
			}
		} catch (err) {
			directorActions.updateScene(sceneId, {
				isGeneratingImage: false,
				imageStatus: null,
			});
			directorActions.setSceneError(err instanceof Error ? err.message : "Failed to generate image");
		}
	};

	const handleGenerateSceneAudio = async (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene || !storyId) return;

		directorActions.updateScene(sceneId, {
			isGeneratingAudio: true,
			audioStatus: "generating",
		});
		directorActions.setSceneError(null);

		try {
			const result = await generateSceneAudioMutation.mutateAsync({
				sceneId,
				caption: scene.caption,
				storyId,
				voiceId: scene.voiceId || defaultVoiceId,
				voiceSpeed: scene.voiceSpeed ?? defaultVoiceSpeed,
			});

			if (result.success && result.audioUrl) {
				directorActions.updateScene(sceneId, {
					audioUrl: result.audioUrl,
					audioId: result.audioId || null,
					audioDuration: result.audioDuration || null,
					wordTimestamps: result.wordTimestamps || null,
					isGeneratingAudio: false,
					audioStatus: "completed",
				});
			} else {
				directorActions.updateScene(sceneId, {
					isGeneratingAudio: false,
					audioStatus: null,
				});
				directorActions.setSceneError(result.error || "Failed to generate audio");
			}
		} catch (err) {
			directorActions.updateScene(sceneId, {
				isGeneratingAudio: false,
				audioStatus: null,
			});
			directorActions.setSceneError(err instanceof Error ? err.message : "Failed to generate audio");
		}
	};

	const handleGenerateSceneVideo = async (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene || !storyId) return;

		// Ensure we have required media for video generation
		if (!scene.imageUrl || !scene.audioUrl || !scene.audioDuration || !scene.imageId || !scene.audioId) {
			directorActions.setSceneError("Image and audio must be generated before video");
			return;
		}

		directorActions.updateScene(sceneId, {
			isGeneratingVideo: true,
			videoError: null,
			videoStatus: "generating",
		});

		try {
			let result;
			if (scene.useAvatar && character?.imageUrl) {
				result = await generateAvatarVideoMutation.mutateAsync({
					sceneId,
					storyId,
					characterImageUrl: character.imageUrl,
					avatarEngine: scene.avatarEngine || defaultAvatarEngine,
				});
			} else {
				result = await generateSceneVideoMutation.mutateAsync({
					sceneId,
					storyId,
					videoPrompt: scene.videoPrompt,
					imageUrl: scene.imageUrl,
					audioUrl: scene.audioUrl,
					audioDuration: scene.audioDuration,
					imageId: scene.imageId,
					audioId: scene.audioId,
					videoEngine: scene.videoEngine || defaultVideoEngine,
				});
			}

			if (result.success && result.videoUrl) {
				directorActions.updateScene(sceneId, {
					videoUrl: result.videoUrl,
					videoId: result.videoId || null,
					videoDuration: result.videoDuration || null,
					isGeneratingVideo: false,
					videoStatus: "completed",
				});
			} else {
				directorActions.updateScene(sceneId, {
					isGeneratingVideo: false,
					videoError: result.error || "Failed to generate video",
					videoStatus: null,
				});
			}
		} catch (err) {
			directorActions.updateScene(sceneId, {
				isGeneratingVideo: false,
				videoError: err instanceof Error ? err.message : "Failed to generate video",
				videoStatus: null,
			});
		}
	};

	const handlePlaySceneAudio = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene?.audioUrl) return;

		if (playingSceneId === sceneId && audioRef.current) {
			audioRef.current.pause();
			audioRef.current = null;
			directorActions.setPlayingSceneId(null);
			return;
		}

		if (audioRef.current) {
			audioRef.current.pause();
		}

		const audio = new Audio(scene.audioUrl);
		audioRef.current = audio;
		directorActions.setPlayingSceneId(sceneId);

		audio.addEventListener("ended", () => {
			directorActions.setPlayingSceneId(null);
			audioRef.current = null;
		});

		audio.play();
	};

	const handleReorderScenes = (fromIndex: number, toIndex: number) => {
		if (!storyId) return;
		directorActions.reorderScenes(fromIndex, toIndex);
		// Build the new scene order after reordering
		const newScenes = [...scenes];
		const [moved] = newScenes.splice(fromIndex, 1);
		newScenes.splice(toIndex, 0, moved);
		const sceneOrder = newScenes.map((s, i) => ({ sceneId: s.id, orderIndex: i }));
		reorderScenesMutation.mutate({ storyId, sceneOrder });
	};

	const handleDownloadExportedVideo = () => {
		if (exportedVideoUrl) {
			window.open(exportedVideoUrl, "_blank");
		}
	};

	// Batch generation
	const scenesNeedingImages = scenes.filter((s) => !s.imageUrl && !s.isGeneratingImage);
	const scenesNeedingVideos = scenes.filter((s) => !s.videoUrl && !s.isGeneratingVideo && s.imageUrl);
	const allImagesCompleted = scenes.every((s) => s.imageUrl);
	const allVideosCompleted = scenes.every((s) => s.videoUrl);

	const handleGenerateAllImages = async () => {
		directorActions.setIsGeneratingAllImages(true);
		directorActions.setBatchProgress({ current: 0, total: scenesNeedingImages.length, type: "image" });

		for (let i = 0; i < scenesNeedingImages.length; i++) {
			const scene = scenesNeedingImages[i];
			directorActions.setBatchProgress({ current: i + 1, total: scenesNeedingImages.length, type: "image" });
			await handleGenerateSceneImage(scene.id);
		}

		directorActions.setIsGeneratingAllImages(false);
		directorActions.setBatchProgress(null);
	};

	const handleGenerateAllAudios = async () => {
		const scenesNeedingAudio = scenes.filter((s) => !s.audioUrl && !s.isGeneratingAudio);
		directorActions.setIsGeneratingAllAudios(true);
		directorActions.setBatchProgress({ current: 0, total: scenesNeedingAudio.length, type: "audio" });

		for (let i = 0; i < scenesNeedingAudio.length; i++) {
			const scene = scenesNeedingAudio[i];
			directorActions.setBatchProgress({ current: i + 1, total: scenesNeedingAudio.length, type: "audio" });
			await handleGenerateSceneAudio(scene.id);
		}

		directorActions.setIsGeneratingAllAudios(false);
		directorActions.setBatchProgress(null);
	};

	const handleGenerateAllVideos = async () => {
		directorActions.setIsGeneratingAllVideos(true);
		directorActions.setBatchProgress({ current: 0, total: scenesNeedingVideos.length, type: "video" });

		for (let i = 0; i < scenesNeedingVideos.length; i++) {
			const scene = scenesNeedingVideos[i];
			directorActions.setBatchProgress({ current: i + 1, total: scenesNeedingVideos.length, type: "video" });

			// Skip if missing required media
			if (!scene.imageUrl || !scene.audioUrl || !scene.audioDuration || !scene.imageId || !scene.audioId) {
				continue;
			}

			directorActions.updateScene(scene.id, {
				isGeneratingVideo: true,
				videoError: null,
				videoStatus: "generating",
			});

			try {
				let result;
				if (scene.useAvatar && character?.imageUrl) {
					result = await generateAvatarVideoMutation.mutateAsync({
						sceneId: scene.id,
						storyId: storyId!,
						characterImageUrl: character.imageUrl,
						avatarEngine: scene.avatarEngine || defaultAvatarEngine,
					});
				} else {
					result = await generateSceneVideoMutation.mutateAsync({
						sceneId: scene.id,
						storyId: storyId!,
						videoPrompt: scene.videoPrompt,
						imageUrl: scene.imageUrl,
						audioUrl: scene.audioUrl,
						audioDuration: scene.audioDuration,
						imageId: scene.imageId,
						audioId: scene.audioId,
						videoEngine: scene.videoEngine || defaultVideoEngine,
					});
				}

				if (result.success && result.videoUrl) {
					directorActions.updateScene(scene.id, {
						videoUrl: result.videoUrl,
						videoId: result.videoId || null,
						videoDuration: result.videoDuration || null,
						isGeneratingVideo: false,
						videoStatus: "completed",
					});
				} else {
					directorActions.updateScene(scene.id, {
						isGeneratingVideo: false,
						videoError: result.error || "Failed to generate video",
					});
				}
			} catch (err) {
				directorActions.updateScene(scene.id, {
					isGeneratingVideo: false,
					videoError: err instanceof Error ? err.message : "Failed to generate video",
				});
			}
		}

		directorActions.setIsGeneratingAllVideos(false);
		directorActions.setBatchProgress(null);
	};

	// Show loading state while creating story
	if (isCreatingStory || (!storyId && createStoryMutation.isPending)) {
		return (
			<div className="flex flex-col items-center justify-center min-h-100">
				<Loader2 className="w-12 h-12 animate-spin text-purple-500 mb-4" />
				<p className="text-muted-foreground">Creating new project...</p>
			</div>
		);
	}

	return (
		<>
			<div className="space-y-8">
				{/* Hidden file input */}
				<input
					type="file"
					ref={fileInputRef}
					onChange={handleUploadCharacter}
					accept="image/*"
					className="hidden"
				/>

				{/* Story Title */}
				<div>
					<textarea
						value={title}
						onChange={(e) => handleTitleChange(e.target.value)}
						placeholder="Enter story title..."
						className="w-full px-4 py-3 bg-background border border-border rounded-lg text-xl font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-purple-500 resize-none"
						rows={1}
					/>
				</div>

				{/* Default Engine Settings */}
				<Card>
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<button
								type="button"
								onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
								className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
							>
								<Settings className="w-4 h-4" />
								Default Engine Settings
								{isSettingsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
							</button>

							{exportedVideoUrl && (
								<Button variant="outline" onClick={handleDownloadExportedVideo} className="flex items-center gap-2 bg-emerald-500/20 border-emerald-500/30 hover:bg-emerald-500/30">
									<Download className="w-4 h-4 text-emerald-400" />
									<span className="text-sm text-emerald-400 font-medium">Download Exported Video</span>
								</Button>
							)}
						</div>

						{/* Summary tags */}
						<div className="flex flex-wrap gap-2 mt-3">
							<div className="px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/30 rounded-lg">
								<span className="text-xs text-cyan-400 font-medium">Image: {IMAGE_ENGINES.find((e) => e.id === defaultImageEngine)?.label}</span>
							</div>
							<div className="px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg">
								<span className="text-xs text-amber-400 font-medium">Style: {defaultImageStyle.charAt(0).toUpperCase() + defaultImageStyle.slice(1).replace("-", " ")}</span>
							</div>
							<div className="px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded-lg">
								<span className="text-xs text-purple-400 font-medium">Video: {VIDEO_ENGINES.find((e) => e.id === defaultVideoEngine)?.label}</span>
							</div>
							<div className="px-3 py-1.5 bg-indigo-500/20 border border-indigo-500/30 rounded-lg">
								<span className="text-xs text-indigo-400 font-medium">Avatar: {AVATAR_ENGINES.find((e) => e.id === defaultAvatarEngine)?.label}</span>
							</div>
						</div>

						{/* Expanded settings */}
						{isSettingsExpanded && (
							<div className="mt-4 pt-4 border-t border-border">
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
									{/* Image Style */}
									<div>
										<label className="block text-sm font-medium text-muted-foreground mb-2">Image Style</label>
										<select
											value={defaultImageStyle}
											onChange={(e) => directorActions.setDefaultImageStyle(e.target.value as DirectorImageStyle)}
											className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-amber-500"
										>
											{IMAGE_STYLES.map((style) => (
												<option key={style.id} value={style.id}>{style.label}</option>
											))}
										</select>
									</div>

									{/* Image Engine */}
									<div>
										<label className="block text-sm font-medium text-muted-foreground mb-2">Image Engine</label>
										<select
											value={defaultImageEngine}
											onChange={(e) => directorActions.setDefaultImageEngine(e.target.value as DirectorImageEngine)}
											className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-cyan-500"
										>
											{IMAGE_ENGINES.map((engine) => (
												<option key={engine.id} value={engine.id}>{engine.label}</option>
											))}
										</select>
									</div>

									{/* Video Engine */}
									<div>
										<label className="block text-sm font-medium text-muted-foreground mb-2">Video Engine</label>
										<select
											value={defaultVideoEngine}
											onChange={(e) => directorActions.setDefaultVideoEngine(e.target.value as DirectorVideoEngine)}
											className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-purple-500"
										>
											{VIDEO_ENGINES.map((engine) => (
												<option key={engine.id} value={engine.id}>{engine.label}</option>
											))}
										</select>
									</div>

									{/* Avatar Engine */}
									<div>
										<label className="block text-sm font-medium text-muted-foreground mb-2">Avatar Engine</label>
										<select
											value={defaultAvatarEngine}
											onChange={(e) => directorActions.setDefaultAvatarEngine(e.target.value as DirectorAvatarEngine)}
											className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-indigo-500"
										>
											{AVATAR_ENGINES.map((engine) => (
												<option key={engine.id} value={engine.id}>{engine.label}</option>
											))}
										</select>
									</div>

									{/* Voice */}
									<div>
										<label className="block text-sm font-medium text-muted-foreground mb-2">Default Voice</label>
										<select
											value={defaultVoiceId}
											onChange={(e) => directorActions.setDefaultVoiceId(e.target.value)}
											className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-emerald-500"
										>
											{VOICE_OPTIONS.map((voice) => (
												<option key={voice.id} value={voice.id}>{voice.label}</option>
											))}
										</select>
									</div>

									{/* Voice Speed */}
									<div>
										<label className="block text-sm font-medium text-muted-foreground mb-2">Voice Speed</label>
										<select
											value={defaultVoiceSpeed}
											onChange={(e) => directorActions.setDefaultVoiceSpeed(Number.parseFloat(e.target.value))}
											className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-emerald-500"
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

								{/* Caption Language */}
								<div className="mb-4">
									<label className="block text-sm font-medium text-muted-foreground mb-2">Caption Language</label>
									<div className="inline-flex rounded-lg bg-muted p-1">
										{CAPTION_LANGUAGES.map((lang) => (
											<Button
												key={lang.id}
												type="button"
												variant={captionLanguage === lang.id ? "default" : "ghost"}
												size="sm"
												onClick={() => directorActions.setCaptionLanguage(lang.id)}
												className={captionLanguage === lang.id
													? "bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm"
													: "text-muted-foreground hover:text-foreground"}
											>
												{lang.label}
											</Button>
										))}
									</div>
								</div>

								{scenes.length > 0 && (
									<>
										<Button variant="outline" onClick={() => directorActions.applyDefaultsToAllScenes()} className="mb-2">
											Apply Defaults to All Scenes
										</Button>
										<p className="text-xs text-muted-foreground">
											This will reset all per-scene engine settings to match the defaults.
										</p>
									</>
								)}
							</div>
						)}
					</CardContent>
				</Card>

				{/* Character Generator */}
				<Card>
					<CardContent className="p-6">
						<h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
							<User className="w-5 h-5 text-cyan-400" />
							Character (16:9)
						</h3>

						<div className="flex gap-6">
							{/* Left side: prompt + buttons */}
							<div className="flex-1 min-w-0">
								<textarea
									value={characterPrompt}
									onChange={(e) => setCharacterPrompt(e.target.value)}
									className="w-full h-40 px-4 py-3 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors resize-none"
									disabled={isGeneratingCharacter}
									placeholder="Describe your character's appearance, clothing, pose, background... This will be used as reference for 16:9 landscape scenes."
								/>

								{/* Character generation buttons */}
								<div className="mt-3 flex gap-3">
									<Button
										onClick={handleGenerateCharacter}
										disabled={!characterPrompt.trim() || isGeneratingCharacter || !storyId}
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
											disabled={isGeneratingCharacter || !storyId}
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

							{/* Right side: 16:9 character preview */}
							<div className="w-64 shrink-0">
								{character?.imageUrl ? (
									<img
										src={character.imageUrl}
										alt="Character preview"
										className="w-full rounded-lg shadow-lg object-cover"
										style={{ aspectRatio: "16/9" }}
									/>
								) : (
									<div
										className="w-full bg-muted border border-border rounded-lg flex items-center justify-center text-muted-foreground"
										style={{ aspectRatio: "16/9" }}
									>
										<div className="text-center p-4">
											<ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
											<span className="text-xs">16:9 Preview</span>
										</div>
									</div>
								)}
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Error Display */}
				{error && (
					<ErrorWithRetry
						error={error.message}
						onRetry={handleGenerateCharacter}
						onDismiss={() => directorActions.setError(null)}
						isRetrying={isGeneratingCharacter}
					/>
				)}

				{/* Batch Generation Controls */}
				{scenes.length > 0 && (
					<Card>
						<CardContent className="p-6">
							<h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
								<Settings className="w-5 h-5 text-amber-400" />
								Batch Generation
							</h3>
							<div className="grid grid-cols-3 gap-4">
								<div>
									<Button onClick={handleGenerateAllImages} disabled={isGeneratingAllImages || scenesNeedingImages.length === 0} className="w-full py-3 h-auto bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-muted disabled:to-muted">
										{isGeneratingAllImages ? (
											<><Loader2 className="w-5 h-5 animate-spin mr-2" />Generating ({batchProgress?.current || 0}/{batchProgress?.total || 0})</>
										) : (
											<><ImageIcon className="w-5 h-5 mr-2" />GENERATE ALL IMAGES</>
										)}
									</Button>
									<p className="mt-2 text-xs text-muted-foreground text-center">{scenesNeedingImages.length} scene(s) need images</p>
								</div>
								<div>
									<Button onClick={handleGenerateAllAudios} disabled={isGeneratingAllAudios} className="w-full py-3 h-auto bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:from-muted disabled:to-muted">
										{isGeneratingAllAudios ? (
											<><Loader2 className="w-5 h-5 animate-spin mr-2" />Generating ({batchProgress?.current || 0}/{batchProgress?.total || 0})</>
										) : (
											<><Volume2 className="w-5 h-5 mr-2" />GENERATE ALL AUDIO</>
										)}
									</Button>
									<p className="mt-2 text-xs text-muted-foreground text-center">{scenes.filter((s) => !s.audioId).length} scene(s) need audio</p>
								</div>
								<div>
									<Button onClick={handleGenerateAllVideos} disabled={isGeneratingAllVideos || !allImagesCompleted || scenesNeedingVideos.length === 0} className="w-full py-3 h-auto bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 disabled:from-muted disabled:to-muted">
										{isGeneratingAllVideos ? (
											<><Loader2 className="w-5 h-5 animate-spin mr-2" />Generating ({batchProgress?.current || 0}/{batchProgress?.total || 0})</>
										) : (
											<><Film className="w-5 h-5 mr-2" />GENERATE ALL VIDEO</>
										)}
									</Button>
									<p className="mt-2 text-xs text-muted-foreground text-center">{!allImagesCompleted ? "Waiting for images" : `${scenesNeedingVideos.length} scene(s) need videos`}</p>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{/* Scene error */}
				{sceneError && (
					<ErrorWithRetry error={sceneError.message} onDismiss={() => directorActions.setSceneError(null)} className="mb-4" />
				)}

				{/* Scene List */}
				{scenes.length > 0 && (
					<div className="space-y-6">
						{scenes.map((scene, index) => (
							<SceneCard
								key={scene.id}
								scene={scene}
								index={index}
								totalScenes={scenes.length}
								isSettingsExpanded={expandedSceneSettings.has(scene.id)}
								playingSceneId={playingSceneId}
								hasCharacterImage={!!character?.imageUrl}
								onToggleSettings={() => toggleSceneSettings(scene.id)}
								onCaptionChange={handleCaptionChange}
								onImagePromptChange={handleImagePromptChange}
								onVideoPromptChange={handleVideoPromptChange}
								onImageEngineChange={handleSceneImageEngineChange}
								onVideoEngineChange={handleSceneVideoEngineChange}
								onAvatarEngineChange={handleSceneAvatarEngineChange}
								onVoiceChange={handleSceneVoiceChange}
								onVoiceSpeedChange={handleSceneVoiceSpeedChange}
								onToggleAvatarMode={handleToggleAvatarMode}
								onGenerateImage={handleGenerateSceneImage}
								onGenerateAudio={handleGenerateSceneAudio}
								onGenerateVideo={handleGenerateSceneVideo}
								onPlayAudio={handlePlaySceneAudio}
								onReorder={handleReorderScenes}
								onDelete={(sceneId) => directorActions.deleteScene(sceneId)}
							/>
						))}

						{/* Add Scene Button */}
						<Button
							variant="outline"
							onClick={() => directorActions.addScene()}
							className="w-full py-4 h-auto border-2 border-dashed border-border hover:border-purple-500 rounded-xl text-muted-foreground hover:text-purple-400 transition-all duration-300 flex items-center justify-center gap-2"
						>
							<Plus className="w-5 h-5" />
							Add New Scene
						</Button>
					</div>
				)}

				{/* Empty state - Add first scene */}
				{scenes.length === 0 && (
					<Card>
						<CardContent className="p-8 text-center">
							<Clapperboard className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
							<h3 className="text-lg font-semibold text-foreground mb-2">No Scenes Yet</h3>
							<p className="text-muted-foreground mb-4">Start adding scenes to build your story</p>
							<Button onClick={() => directorActions.addScene()} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400">
								<Plus className="w-5 h-5 mr-2" />
								Add First Scene
							</Button>
						</CardContent>
					</Card>
				)}

				{/* Navigation Buttons */}
				{allVideosCompleted && scenes.length > 0 && (
					<div className="flex gap-4">
						<Button
							onClick={() => navigate({ to: "/director-mode/subtitles" })}
							size="lg"
							className="flex-1 py-6 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50"
						>
							<Captions className="w-6 h-6 mr-3" />
							CUSTOMIZE SUBTITLES
						</Button>
						<Button
							onClick={() => navigate({ to: "/director-mode/export" })}
							size="lg"
							className="flex-1 py-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50"
						>
							<Film className="w-6 h-6 mr-3" />
							GO TO EXPORT
						</Button>
					</div>
				)}
			</div>

			{/* AI Assistant */}
			<DirectorAssistant />

			{/* Asset Picker Modal */}
			<AssetPickerModal
				isOpen={isAssetPickerOpen}
				onClose={() => setIsAssetPickerOpen(false)}
				onSelect={handleImportFromAssets}
				title="Select Character Image (16:9)"
			/>
		</>
	);
}

// ============================================================================
// Scene Card Component
// ============================================================================

interface SceneCardProps {
	scene: DirectorSceneState;
	index: number;
	totalScenes: number;
	isSettingsExpanded: boolean;
	playingSceneId: string | null;
	hasCharacterImage: boolean;
	onToggleSettings: () => void;
	onCaptionChange: (sceneId: string, caption: string) => void;
	onImagePromptChange: (sceneId: string, imagePrompt: string) => void;
	onVideoPromptChange: (sceneId: string, videoPrompt: string) => void;
	onImageEngineChange: (sceneId: string, engine: DirectorImageEngine) => void;
	onVideoEngineChange: (sceneId: string, engine: DirectorVideoEngine) => void;
	onAvatarEngineChange: (sceneId: string, engine: DirectorAvatarEngine | null) => void;
	onVoiceChange: (sceneId: string, voiceId: DirectorVoiceId) => void;
	onVoiceSpeedChange: (sceneId: string, speed: number) => void;
	onToggleAvatarMode: (sceneId: string, useAvatar: boolean) => void;
	onGenerateImage: (sceneId: string) => void;
	onGenerateAudio: (sceneId: string) => void;
	onGenerateVideo: (sceneId: string) => void;
	onPlayAudio: (sceneId: string) => void;
	onReorder: (fromIndex: number, toIndex: number) => void;
	onDelete: (sceneId: string) => void;
}

function SceneCard({
	scene,
	index,
	totalScenes,
	isSettingsExpanded,
	playingSceneId,
	hasCharacterImage,
	onToggleSettings,
	onCaptionChange,
	onImagePromptChange,
	onVideoPromptChange,
	onImageEngineChange,
	onVideoEngineChange,
	onAvatarEngineChange,
	onVoiceChange,
	onVoiceSpeedChange,
	onToggleAvatarMode,
	onGenerateImage,
	onGenerateAudio,
	onGenerateVideo,
	onPlayAudio,
	onReorder,
	onDelete,
}: SceneCardProps) {
	return (
		<Card>
			<CardContent className="p-6">
				{/* Scene header */}
				<div className="flex items-center justify-between mb-4">
					<div className="flex items-center gap-3">
						<span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
							Scene {index + 1}
						</span>
						{/* Reorder buttons */}
						<div className="flex gap-1">
							<Button
								variant="ghost"
								size="sm"
								disabled={index === 0}
								onClick={() => onReorder(index, index - 1)}
								className="h-6 w-6 p-0"
							>
								<ChevronUp className="w-4 h-4" />
							</Button>
							<Button
								variant="ghost"
								size="sm"
								disabled={index === totalScenes - 1}
								onClick={() => onReorder(index, index + 1)}
								className="h-6 w-6 p-0"
							>
								<ChevronDown className="w-4 h-4" />
							</Button>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={onToggleSettings}
							className="text-muted-foreground hover:text-foreground"
						>
							<Settings className="w-4 h-4 mr-1" />
							Settings
							{isSettingsExpanded ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
						</Button>
						{totalScenes > 1 && (
							<Button
								variant="ghost"
								size="sm"
								onClick={() => onDelete(scene.id)}
								className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
							>
								<Trash2 className="w-4 h-4" />
							</Button>
						)}
					</div>
				</div>

				{/* Scene settings (expandable) */}
				{isSettingsExpanded && (
					<div className="mb-4 p-4 bg-muted/50 rounded-lg border border-border">
						<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
							<div>
								<label className="block text-xs font-medium text-muted-foreground mb-1">
									{scene.useAvatar ? "Avatar Engine" : "Image Engine"}
								</label>
								{scene.useAvatar ? (
									<select
										value={scene.avatarEngine || ""}
										onChange={(e) => onAvatarEngineChange(scene.id, e.target.value as DirectorAvatarEngine)}
										className="w-full px-2 py-1 text-sm bg-background border border-border rounded"
									>
										{AVATAR_ENGINES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
									</select>
								) : (
									<select
										value={scene.imageEngine}
										onChange={(e) => onImageEngineChange(scene.id, e.target.value as DirectorImageEngine)}
										className="w-full px-2 py-1 text-sm bg-background border border-border rounded"
									>
										{IMAGE_ENGINES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
									</select>
								)}
							</div>
							<div>
								<label className="block text-xs font-medium text-muted-foreground mb-1">Video Engine</label>
								<select
									value={scene.videoEngine}
									onChange={(e) => onVideoEngineChange(scene.id, e.target.value as DirectorVideoEngine)}
									className="w-full px-2 py-1 text-sm bg-background border border-border rounded"
								>
									{VIDEO_ENGINES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
								</select>
							</div>
							<div>
								<label className="block text-xs font-medium text-muted-foreground mb-1">Voice</label>
								<select
									value={scene.voiceId}
									onChange={(e) => onVoiceChange(scene.id, e.target.value as DirectorVoiceId)}
									className="w-full px-2 py-1 text-sm bg-background border border-border rounded"
								>
									{VOICE_OPTIONS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
								</select>
							</div>
							<div>
								<label className="block text-xs font-medium text-muted-foreground mb-1">Voice Speed</label>
								<select
									value={scene.voiceSpeed}
									onChange={(e) => onVoiceSpeedChange(scene.id, Number.parseFloat(e.target.value))}
									className="w-full px-2 py-1 text-sm bg-background border border-border rounded"
								>
									<option value={0.7}>0.7x</option>
									<option value={0.8}>0.8x</option>
									<option value={0.9}>0.9x</option>
									<option value={1.0}>1.0x</option>
									<option value={1.1}>1.1x</option>
									<option value={1.2}>1.2x</option>
								</select>
							</div>
							<div>
								<label className="block text-xs font-medium text-muted-foreground mb-1">Avatar Mode</label>
								<Button
									variant={scene.useAvatar ? "default" : "outline"}
									size="sm"
									onClick={() => onToggleAvatarMode(scene.id, !scene.useAvatar)}
									className="w-full"
									disabled={!hasCharacterImage}
									title={!hasCharacterImage ? "Generate or upload a character image first" : undefined}
								>
									{scene.useAvatar ? "Avatar ON" : "Avatar OFF"}
								</Button>
							</div>
						</div>
					</div>
				)}

				{/* Scene content - Vertical flow */}
				<div className="space-y-6">
					{/* === IMAGE SECTION === */}
					<div className="space-y-3">
						<div className="flex gap-4">
							{/* Left: Image Prompt */}
							<div className="flex-1">
								<label className="block text-sm font-medium text-muted-foreground mb-2">Image Prompt</label>
								<textarea
									value={scene.imagePrompt}
									onChange={(e) => onImagePromptChange(scene.id, e.target.value)}
									className="w-full h-24 px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-purple-500 resize-none"
									placeholder="Describe what should appear in this scene's image..."
								/>
							</div>
							{/* Right: Image Preview */}
							<div className="w-40 shrink-0">
								<label className="block text-sm font-medium text-muted-foreground mb-2">Preview</label>
								{scene.imageUrl ? (
									<img src={scene.imageUrl} alt={`Scene ${index + 1}`} className="w-full rounded-lg object-cover" style={{ aspectRatio: "16/9" }} />
								) : (
									<div className="w-full bg-muted border border-border rounded-lg flex items-center justify-center" style={{ aspectRatio: "16/9" }}>
										<ImageIcon className="w-6 h-6 text-muted-foreground opacity-50" />
									</div>
								)}
							</div>
						</div>
						{/* Generate Image Button */}
						<div className="flex items-center gap-3">
							<Button
								onClick={() => onGenerateImage(scene.id)}
								disabled={scene.isGeneratingImage || !scene.imagePrompt.trim()}
								size="sm"
								className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-muted disabled:to-muted"
							>
								{scene.isGeneratingImage ? (
									<><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating...</>
								) : (
									<><ImageIcon className="w-4 h-4 mr-2" />{scene.imageUrl ? "Regenerate" : "Generate"} Image</>
								)}
							</Button>
							<CountdownProgress isActive={scene.isGeneratingImage} durationSeconds={30} />
						</div>
					</div>

					<div className="border-t border-border" />

					{/* === AUDIO SECTION === */}
					<div className="space-y-3">
						<div className="flex gap-4">
							{/* Left: Caption */}
							<div className="flex-1">
								<label className="block text-sm font-medium text-muted-foreground mb-2">Caption / Narration</label>
								<textarea
									value={scene.caption}
									onChange={(e) => onCaptionChange(scene.id, e.target.value)}
									className="w-full h-24 px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-emerald-500 resize-none"
									placeholder="Enter the narration text for this scene..."
								/>
							</div>
							{/* Right: Audio controls */}
							<div className="w-40 shrink-0">
								<label className="block text-sm font-medium text-muted-foreground mb-2">Audio</label>
								<div className="h-24 bg-muted border border-border rounded-lg flex flex-col items-center justify-center gap-2">
									{scene.audioUrl ? (
										<>
											<Button
												onClick={() => onPlayAudio(scene.id)}
												size="sm"
												variant={playingSceneId === scene.id ? "default" : "outline"}
												className="w-20"
											>
												{playingSceneId === scene.id ? (
													<><Volume2 className="w-4 h-4 mr-1" />Playing</>
												) : (
													<><Play className="w-4 h-4 mr-1" />Play</>
												)}
											</Button>
											{scene.audioDuration && (
												<span className="text-xs text-muted-foreground">
													{Math.floor(scene.audioDuration / 60)}:{String(Math.floor(scene.audioDuration % 60)).padStart(2, '0')}
												</span>
											)}
										</>
									) : (
										<Volume2 className="w-6 h-6 text-muted-foreground opacity-50" />
									)}
								</div>
							</div>
						</div>
						{/* Generate Audio Button */}
						<div className="flex items-center gap-3">
							<Button
								onClick={() => onGenerateAudio(scene.id)}
								disabled={scene.isGeneratingAudio || !scene.caption.trim()}
								size="sm"
								variant="outline"
							>
								{scene.isGeneratingAudio ? (
									<><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating...</>
								) : (
									<><Volume2 className="w-4 h-4 mr-2" />{scene.audioUrl ? "Regenerate" : "Generate"} Audio</>
								)}
							</Button>
						</div>
					</div>

					<div className="border-t border-border" />

					{/* === VIDEO SECTION === */}
					<div className="space-y-3">
						<div className="flex gap-4">
							{/* Left: Video Instruction */}
							<div className="flex-1">
								<label className="block text-sm font-medium text-muted-foreground mb-2">Video Instruction</label>
								<textarea
									value={scene.videoPrompt}
									onChange={(e) => onVideoPromptChange(scene.id, e.target.value)}
									className="w-full h-24 px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-indigo-500 resize-none"
									placeholder="Describe camera movement and action..."
								/>
								{scene.videoError && <InlineError error={scene.videoError} />}
							</div>
							{/* Right: Video Preview */}
							<div className="w-40 shrink-0">
								<label className="block text-sm font-medium text-muted-foreground mb-2">Preview</label>
								{scene.videoUrl ? (
									<video src={scene.videoUrl} className="w-full rounded-lg object-cover" style={{ aspectRatio: "16/9" }} controls muted />
								) : (
									<div className="w-full bg-muted border border-border rounded-lg flex items-center justify-center" style={{ aspectRatio: "16/9" }}>
										<Film className="w-6 h-6 text-muted-foreground opacity-50" />
									</div>
								)}
							</div>
						</div>
						{/* Generate Video Button */}
						<div className="flex items-center gap-3">
							<Button
								onClick={() => onGenerateVideo(scene.id)}
								disabled={scene.isGeneratingVideo || !scene.imageUrl || !scene.audioUrl}
								size="sm"
								className="bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 disabled:from-muted disabled:to-muted"
							>
								{scene.isGeneratingVideo ? (
									<><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating...</>
								) : (
									<><Film className="w-4 h-4 mr-2" />{scene.videoUrl ? "Regenerate" : "Generate"} Video</>
								)}
							</Button>
							<CountdownProgress isActive={scene.isGeneratingVideo} durationSeconds={120} />
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
