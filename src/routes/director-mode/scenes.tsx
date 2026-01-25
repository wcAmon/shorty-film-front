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
	MessageSquare,
	Play,
	Plus,
	Settings,
	Sparkles,
	Trash2,
	Upload,
	User,
	Volume2,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { AssetPickerModal } from "@/components/asset-picker-modal";
import { VideoAssetPickerModal } from "@/components/video-asset-picker-modal";
import { CountdownProgress } from "@/components/countdown-progress";
import { DirectorAssistantPanel } from "@/components/director-assistant/DirectorAssistantPanel";
import { SoundEffectWaveform } from "@/components/sound-effect-waveform";
import { ErrorWithRetry, InlineError } from "@/components/error-with-retry";
import {
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
import { authFetch } from "@/hooks/use-auth";
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
	{ id: "flux-schnell", label: "Flux Schnell", description: "Ultra-fast text-to-image, sub-second generation" },
	{ id: "flux-schnell-i2i", label: "Flux Schnell (I2I)", description: "Ultra-fast image-to-image with character reference" },
	{ id: "gpt-image-1.5", label: "GPT Image 1.5", description: "OpenAI GPT-Image via FAL AI, with character consistency" },
	{ id: "nano-banana-pro", label: "Nano Banana Pro", description: "Fast character-consistent generation with reference support" },
	{ id: "nano-banana", label: "Nano Banana", description: "Lightweight, fast generation with character reference" },
];

const VIDEO_ENGINES: { id: DirectorVideoEngine; label: string; description?: string }[] = [
	{ id: "kling-video-v2.5-turbo", label: "Kling v2.5 Turbo", description: "Kling Video v2.5 Turbo, fast generation (recommended)" },
	{ id: "sora-2", label: "Sora 2", description: "OpenAI Sora 2 via FAL AI, high quality video generation" },
	{ id: "ltx-2-19b", label: "LTX-2 19B", description: "Fast generation with good motion quality" },
	{ id: "wan-pro", label: "Wan Pro (6s)", description: "Fixed 6 second duration, 1080p at 30fps" },
];

const AVATAR_ENGINES: { id: DirectorAvatarEngine; label: string; description?: string }[] = [
	{ id: "kling-avatar-v2-standard", label: "Kling Avatar v2 Standard", description: "Fast, high-quality talking head generation (recommended)" },
	{ id: "kling-avatar-v2-pro", label: "Kling Avatar v2 Pro", description: "Higher quality with more detailed expressions" },
	{ id: "omnihuman", label: "OmniHuman v1.5", description: "ByteDance's talking head model, supports longer audio" },
	{ id: "aurora", label: "Aurora", description: "Alternative avatar generation" },
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
// Route with Search Params
// ============================================================================

interface DirectorScenesSearchParams {
	storyId?: string;
}

export const Route = createFileRoute("/director-mode/scenes")({
	validateSearch: (search: Record<string, unknown>): DirectorScenesSearchParams => ({
		storyId: typeof search.storyId === "string" ? search.storyId : undefined,
	}),
	beforeLoad: ({ search }) => {
		const state = directorStore.state;
		// If URL has no storyId and store has no storyId, redirect to setup page
		if (!search.storyId && !state.storyId) {
			throw redirect({ to: "/director-mode" });
		}
	},
	component: DirectorScenesPage,
});

// ============================================================================
// Main Component - Scene Editor
// ============================================================================

function DirectorScenesPage() {
	const navigate = useNavigate();
	const { storyId: urlStoryId } = Route.useSearch();

	// React Query mutations
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
	const storeStoryId = useStore(directorStore, (s) => s.storyId);
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
	const batchCancelled = useStore(directorStore, (s) => s.batchCancelled);
	const pendingRegenerateQueue = useStore(directorStore, (s) => s.pendingRegenerateQueue);

	// Effective storyId (URL param takes precedence)
	const storyId = urlStoryId || storeStoryId;

	// Local state
	const [characterPrompt, setCharacterPrompt] = useState(character?.imagePrompt || "");
	const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);
	const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
	const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
	// State for scene image asset picker and upload menu
	const [sceneImageAssetPickerOpen, setSceneImageAssetPickerOpen] = useState<string | null>(null);
	const [sceneImageUploadMenuOpen, setSceneImageUploadMenuOpen] = useState<string | null>(null);
	// State for scene video asset picker and upload menu
	const [sceneVideoAssetPickerOpen, setSceneVideoAssetPickerOpen] = useState<string | null>(null);
	const [sceneVideoUploadMenuOpen, setSceneVideoUploadMenuOpen] = useState<string | null>(null);
	const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
	const [isAssistantCollapsed, setIsAssistantCollapsed] = useState(false);
	const [expandedSceneSettings, setExpandedSceneSettings] = useState<Set<string>>(new Set());
	const [isLoadingStory, setIsLoadingStory] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);

	// Refs
	const fileInputRef = useRef<HTMLInputElement>(null);
	const uploadMenuRef = useRef<HTMLDivElement>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	// Effect: Load story from URL storyId if different from store
	useEffect(() => {
		if (urlStoryId && urlStoryId !== storeStoryId) {
			setIsLoadingStory(true);
			setLoadError(null);
			// Set the storyId in store - the story data will be loaded by the store's existing mechanisms
			directorActions.setStoryId(urlStoryId);
			// TODO: If needed, add API call to load story data here
			setIsLoadingStory(false);
		}
	}, [urlStoryId, storeStoryId]);

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

	// Effect: Close scene image/video upload menus when clicking outside
	useEffect(() => {
		const handleClickOutside = () => {
			setSceneImageUploadMenuOpen(null);
			setSceneVideoUploadMenuOpen(null);
		};

		if (sceneImageUploadMenuOpen || sceneVideoUploadMenuOpen) {
			const timeoutId = setTimeout(() => {
				document.addEventListener("mousedown", handleClickOutside);
			}, 0);
			return () => {
				clearTimeout(timeoutId);
				document.removeEventListener("mousedown", handleClickOutside);
			};
		}
	}, [sceneImageUploadMenuOpen, sceneVideoUploadMenuOpen]);

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

	// Handle import scene image from asset library
	const handleImportSceneImageFromAssets = async (
		sceneId: string,
		imageUrl: string,
		imageId: string,
	) => {
		directorActions.updateScene(sceneId, { isGeneratingImage: true });
		setSceneImageAssetPickerOpen(null);

		try {
			const response = await authFetch("/api/link-scene-media", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sceneId, imageId }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to link image to scene");
			}

			const result = await response.json();
			if (!result.success) {
				throw new Error(result.error || "Failed to link image to scene");
			}

			directorActions.updateScene(sceneId, {
				imageId,
				imageUrl: result.imageUrl || imageUrl,
				imageStatus: "completed",
				isGeneratingImage: false,
			});
		} catch (err) {
			directorActions.updateScene(sceneId, { isGeneratingImage: false });
			directorActions.setError(
				err instanceof Error ? err.message : "Failed to import image from assets",
			);
		}
	};

	// Handle import scene video from asset library
	const handleImportSceneVideoFromAssets = async (
		sceneId: string,
		videoUrl: string,
		videoId: string,
	) => {
		directorActions.updateScene(sceneId, { isGeneratingVideo: true });
		setSceneVideoAssetPickerOpen(null);

		try {
			const response = await authFetch("/api/link-scene-media", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sceneId, videoId }),
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || "Failed to link video to scene");
			}

			const result = await response.json();
			if (!result.success) {
				throw new Error(result.error || "Failed to link video to scene");
			}

			directorActions.updateScene(sceneId, {
				videoId,
				videoUrl: result.videoUrl || videoUrl,
				videoStatus: "completed",
				isGeneratingVideo: false,
			});
		} catch (err) {
			directorActions.updateScene(sceneId, { isGeneratingVideo: false });
			directorActions.setError(
				err instanceof Error ? err.message : "Failed to import video from assets",
			);
		}
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

	// Scene generation handlers - internal implementation
	const executeGenerateSceneImage = async (sceneId: string) => {
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
				imageEngine: scene.imageEngine || defaultImageEngine,
				// Only pass character reference if checkbox is checked and character has an image
				characterImageUrl: scene.useCharacterReference && character?.imageUrl ? character.imageUrl : undefined,
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

	// Wrapper that queues during batch generation
	const handleGenerateSceneImage = async (sceneId: string) => {
		// If batch image generation is in progress, add to queue instead
		if (directorStore.state.isGeneratingAllImages) {
			directorActions.addToPendingQueue(sceneId, "image");
			return;
		}
		await executeGenerateSceneImage(sceneId);
	};

	const executeGenerateSceneAudio = async (sceneId: string) => {
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

	// Wrapper that queues during batch generation
	const handleGenerateSceneAudio = async (sceneId: string) => {
		// If batch audio generation is in progress, add to queue instead
		if (directorStore.state.isGeneratingAllAudios) {
			directorActions.addToPendingQueue(sceneId, "audio");
			return;
		}
		await executeGenerateSceneAudio(sceneId);
	};

	const executeGenerateSceneVideo = async (sceneId: string) => {
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

	// Wrapper that queues during batch generation
	const handleGenerateSceneVideo = async (sceneId: string) => {
		// If batch video generation is in progress, add to queue instead
		if (directorStore.state.isGeneratingAllVideos) {
			directorActions.addToPendingQueue(sceneId, "video");
			return;
		}
		await executeGenerateSceneVideo(sceneId);
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

	// Sound effect handlers
	const handleSoundEffectOffsetChange = async (sceneId: string, offset: number) => {
		directorActions.setSoundEffectOffset(sceneId, offset);
		// Save offset to database
		try {
			await authFetch("/api/update-sound-effect-offset", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sceneId, offset }),
			});
		} catch (err) {
			console.error("Failed to save sound effect offset:", err);
		}
	};

	const handleGenerateSoundEffect = async (sceneId: string, prompt: string, duration: number) => {
		if (!prompt.trim() || !storyId) return;
		directorActions.setIsGeneratingSoundEffect(sceneId, true);
		try {
			const response = await authFetch("/api/generate-sound-effect", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					prompt,
					storyId,
					sceneId,
					durationSeconds: duration,
				}),
			});
			const result = await response.json();
			if (result.success && result.jobId) {
				// Poll for job completion
				const pollJob = async () => {
					const statusRes = await authFetch(`/api/job-status?jobId=${result.jobId}`);
					const status = await statusRes.json();
					if (status.status === "completed" && status.metadata) {
						directorActions.updateSoundEffectStatus(
							sceneId,
							"completed",
							status.metadata.audioUrl,
							status.metadata.duration,
							status.metadata.soundEffectId,
						);
						directorActions.setIsGeneratingSoundEffect(sceneId, false);
					} else if (status.status === "failed") {
						directorActions.setSceneError(status.error || "Sound effect generation failed");
						directorActions.setIsGeneratingSoundEffect(sceneId, false);
					} else {
						setTimeout(pollJob, 3000);
					}
				};
				pollJob();
			} else {
				throw new Error(result.error || "Failed to start sound effect generation");
			}
		} catch (err) {
			directorActions.setSceneError(
				err instanceof Error ? err.message : "Sound effect generation failed",
			);
			directorActions.setIsGeneratingSoundEffect(sceneId, false);
		}
	};

	const handleMergeSoundEffect = async (sceneId: string, offset: number) => {
		if (!storyId) return;
		directorActions.setIsMergingSoundEffect(sceneId, true);
		try {
			const response = await authFetch("/api/merge-sound-effect", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sceneId, storyId, offset }),
			});
			const result = await response.json();
			if (result.success && result.jobId) {
				// Poll for job completion
				const pollJob = async () => {
					const statusRes = await authFetch(`/api/job-status?jobId=${result.jobId}`);
					const status = await statusRes.json();
					if (status.status === "completed" && status.metadata) {
						directorActions.updateScene(sceneId, {
							videoUrl: status.metadata.videoUrl,
							videoId: status.metadata.videoId,
						});
						directorActions.setIsMergingSoundEffect(sceneId, false);
					} else if (status.status === "failed") {
						directorActions.setSceneError(status.error || "Merge failed");
						directorActions.setIsMergingSoundEffect(sceneId, false);
					} else {
						setTimeout(pollJob, 3000);
					}
				};
				pollJob();
			} else {
				throw new Error(result.error || "Failed to start merge");
			}
		} catch (err) {
			directorActions.setSceneError(
				err instanceof Error ? err.message : "Merge failed",
			);
			directorActions.setIsMergingSoundEffect(sceneId, false);
		}
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
	// Check if any scene is currently generating (for disabling batch buttons)
	const anySceneGeneratingImage = scenes.some((s) => s.isGeneratingImage);
	const anySceneGeneratingAudio = scenes.some((s) => s.isGeneratingAudio);
	const anySceneGeneratingVideo = scenes.some((s) => s.isGeneratingVideo);

	const handleGenerateAllImages = async () => {
		directorActions.setIsGeneratingAllImages(true);
		directorActions.setBatchCancelled(false);
		directorActions.setBatchProgress({ current: 0, total: scenesNeedingImages.length, type: "image" });

		for (let i = 0; i < scenesNeedingImages.length; i++) {
			// Check if cancelled before starting next item
			if (directorStore.state.batchCancelled) {
				break;
			}
			const scene = scenesNeedingImages[i];
			directorActions.setBatchProgress({ current: i + 1, total: scenesNeedingImages.length, type: "image" });
			await executeGenerateSceneImage(scene.id);
		}

		directorActions.setIsGeneratingAllImages(false);
		directorActions.setBatchProgress(null);
		directorActions.setBatchCancelled(false);

		// Process pending queue for images
		const pendingImages = directorStore.state.pendingRegenerateQueue.filter((item) => item.type === "image");
		if (pendingImages.length > 0) {
			for (const item of pendingImages) {
				directorActions.removeFromPendingQueue(item.sceneId, "image");
				await executeGenerateSceneImage(item.sceneId);
			}
		}
	};

	const handleCancelBatchImages = () => {
		directorActions.cancelBatchGeneration();
		// Clear pending image queue when cancelled
		const pendingImages = directorStore.state.pendingRegenerateQueue.filter((item) => item.type === "image");
		for (const item of pendingImages) {
			directorActions.removeFromPendingQueue(item.sceneId, "image");
		}
	};

	const handleGenerateAllAudios = async () => {
		const scenesNeedingAudio = scenes.filter((s) => !s.audioUrl && !s.isGeneratingAudio);
		directorActions.setIsGeneratingAllAudios(true);
		directorActions.setBatchCancelled(false);
		directorActions.setBatchProgress({ current: 0, total: scenesNeedingAudio.length, type: "audio" });

		for (let i = 0; i < scenesNeedingAudio.length; i++) {
			// Check if cancelled before starting next item
			if (directorStore.state.batchCancelled) {
				break;
			}
			const scene = scenesNeedingAudio[i];
			directorActions.setBatchProgress({ current: i + 1, total: scenesNeedingAudio.length, type: "audio" });
			await executeGenerateSceneAudio(scene.id);
		}

		directorActions.setIsGeneratingAllAudios(false);
		directorActions.setBatchProgress(null);
		directorActions.setBatchCancelled(false);

		// Process pending queue for audios
		const pendingAudios = directorStore.state.pendingRegenerateQueue.filter((item) => item.type === "audio");
		if (pendingAudios.length > 0) {
			for (const item of pendingAudios) {
				directorActions.removeFromPendingQueue(item.sceneId, "audio");
				await executeGenerateSceneAudio(item.sceneId);
			}
		}
	};

	const handleCancelBatchAudios = () => {
		directorActions.cancelBatchGeneration();
		// Clear pending audio queue when cancelled
		const pendingAudios = directorStore.state.pendingRegenerateQueue.filter((item) => item.type === "audio");
		for (const item of pendingAudios) {
			directorActions.removeFromPendingQueue(item.sceneId, "audio");
		}
	};

	const handleGenerateAllVideos = async () => {
		directorActions.setIsGeneratingAllVideos(true);
		directorActions.setBatchCancelled(false);
		directorActions.setBatchProgress({ current: 0, total: scenesNeedingVideos.length, type: "video" });

		for (let i = 0; i < scenesNeedingVideos.length; i++) {
			// Check if cancelled before starting next item
			if (directorStore.state.batchCancelled) {
				break;
			}
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
		directorActions.setBatchCancelled(false);

		// Process pending queue for videos
		const pendingVideos = directorStore.state.pendingRegenerateQueue.filter((item) => item.type === "video");
		if (pendingVideos.length > 0) {
			for (const item of pendingVideos) {
				directorActions.removeFromPendingQueue(item.sceneId, "video");
				await executeGenerateSceneVideo(item.sceneId);
			}
		}
	};

	const handleCancelBatchVideos = () => {
		directorActions.cancelBatchGeneration();
		// Clear pending video queue when cancelled
		const pendingVideos = directorStore.state.pendingRegenerateQueue.filter((item) => item.type === "video");
		for (const item of pendingVideos) {
			directorActions.removeFromPendingQueue(item.sceneId, "video");
		}
	};

	// Show loading state while loading story from URL
	if (isLoadingStory) {
		return (
			<div className="flex flex-col items-center justify-center min-h-100">
				<Loader2 className="w-12 h-12 animate-spin text-purple-500 mb-4" />
				<p className="text-muted-foreground">Loading project...</p>
			</div>
		);
	}

	// Show error if story failed to load
	if (loadError) {
		return (
			<div className="flex flex-col items-center justify-center min-h-100">
				<div className="text-center">
					<p className="text-red-400 mb-4">{loadError}</p>
					<Button onClick={() => navigate({ to: "/director-mode" })}>
						Create New Project
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-[calc(100vh-4rem)] overflow-hidden">
			{/* Left: Scenes Editor */}
			<div className="flex-1 overflow-y-auto p-6">
				<div className="mx-auto max-w-4xl space-y-8">
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
								{/* Image Engine Selector */}
								<div className="mb-3">
									<label className="block text-sm font-medium text-muted-foreground mb-1">Image Engine</label>
									<select
										value={character?.imageEngine || defaultImageEngine}
										onChange={(e) => {
											if (character) {
												directorActions.updateCharacter({ imageEngine: e.target.value as DirectorImageEngine });
											}
											directorActions.setDefaultImageEngine(e.target.value as DirectorImageEngine);
										}}
										className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-cyan-500"
									>
										{IMAGE_ENGINES.map((engine) => (
											<option key={engine.id} value={engine.id}>{engine.label}</option>
										))}
									</select>
								</div>

								<textarea
									value={characterPrompt}
									onChange={(e) => setCharacterPrompt(e.target.value)}
									className="w-full h-32 px-4 py-3 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors resize-none"
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
									{isGeneratingAllImages ? (
										<Button onClick={handleCancelBatchImages} className="w-full py-3 h-auto bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400">
											<X className="w-5 h-5 mr-2" />Cancel ({batchProgress?.current || 0}/{batchProgress?.total || 0})
										</Button>
									) : (
										<Button onClick={handleGenerateAllImages} disabled={scenesNeedingImages.length === 0 || anySceneGeneratingImage} className="w-full py-3 h-auto bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-muted disabled:to-muted">
											<ImageIcon className="w-5 h-5 mr-2" />GENERATE ALL IMAGES
										</Button>
									)}
									<p className="mt-2 text-xs text-muted-foreground text-center">
										{anySceneGeneratingImage ? "Scene generating..." : `${scenesNeedingImages.length} scene(s) need images`}
									</p>
								</div>
								<div>
									{isGeneratingAllAudios ? (
										<Button onClick={handleCancelBatchAudios} className="w-full py-3 h-auto bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400">
											<X className="w-5 h-5 mr-2" />Cancel ({batchProgress?.current || 0}/{batchProgress?.total || 0})
										</Button>
									) : (
										<Button onClick={handleGenerateAllAudios} disabled={scenes.filter((s) => !s.audioUrl && !s.isGeneratingAudio).length === 0 || anySceneGeneratingAudio} className="w-full py-3 h-auto bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:from-muted disabled:to-muted">
											<Volume2 className="w-5 h-5 mr-2" />GENERATE ALL AUDIO
										</Button>
									)}
									<p className="mt-2 text-xs text-muted-foreground text-center">
										{anySceneGeneratingAudio ? "Scene generating..." : `${scenes.filter((s) => !s.audioId).length} scene(s) need audio`}
									</p>
								</div>
								<div>
									{isGeneratingAllVideos ? (
										<Button onClick={handleCancelBatchVideos} className="w-full py-3 h-auto bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400">
											<X className="w-5 h-5 mr-2" />Cancel ({batchProgress?.current || 0}/{batchProgress?.total || 0})
										</Button>
									) : (
										<Button onClick={handleGenerateAllVideos} disabled={!allImagesCompleted || scenesNeedingVideos.length === 0 || anySceneGeneratingVideo} className="w-full py-3 h-auto bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 disabled:from-muted disabled:to-muted">
											<Film className="w-5 h-5 mr-2" />GENERATE ALL VIDEO
										</Button>
									)}
									<p className="mt-2 text-xs text-muted-foreground text-center">
										{anySceneGeneratingVideo ? "Scene generating..." : (!allImagesCompleted ? "Waiting for images" : `${scenesNeedingVideos.length} scene(s) need videos`)}
									</p>
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
								isImageQueued={pendingRegenerateQueue.some((item) => item.sceneId === scene.id && item.type === "image")}
								isAudioQueued={pendingRegenerateQueue.some((item) => item.sceneId === scene.id && item.type === "audio")}
								isVideoQueued={pendingRegenerateQueue.some((item) => item.sceneId === scene.id && item.type === "video")}
								isImageUploadMenuOpen={sceneImageUploadMenuOpen === scene.id}
								isVideoUploadMenuOpen={sceneVideoUploadMenuOpen === scene.id}
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
								onToggleCharacterReference={(sceneId, useRef) => directorActions.toggleSceneCharacterReference(sceneId, useRef)}
								onGenerateImage={handleGenerateSceneImage}
								onGenerateAudio={handleGenerateSceneAudio}
								onGenerateVideo={handleGenerateSceneVideo}
								onPlayAudio={handlePlaySceneAudio}
								onReorder={handleReorderScenes}
								onDelete={(sceneId) => directorActions.deleteScene(sceneId)}
								onOpenImageAssetPicker={(sceneId) => setSceneImageAssetPickerOpen(sceneId)}
								onToggleImageUploadMenu={(sceneId) => setSceneImageUploadMenuOpen(sceneId)}
								onOpenVideoAssetPicker={(sceneId) => setSceneVideoAssetPickerOpen(sceneId)}
								onToggleVideoUploadMenu={(sceneId) => setSceneVideoUploadMenuOpen(sceneId)}
								onSoundEffectPromptChange={(sceneId, prompt) => directorActions.setSoundEffectPrompt(sceneId, prompt)}
								onSoundEffectOffsetChange={handleSoundEffectOffsetChange}
								onGenerateSoundEffect={handleGenerateSoundEffect}
								onMergeSoundEffect={handleMergeSoundEffect}
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

				{/* Asset Picker Modal for Character */}
				<AssetPickerModal
					isOpen={isAssetPickerOpen}
					onClose={() => setIsAssetPickerOpen(false)}
					onSelect={handleImportFromAssets}
					title="Select Character Image (16:9)"
				/>

				{/* Asset Picker Modal for Scene Image */}
				<AssetPickerModal
					isOpen={sceneImageAssetPickerOpen !== null}
					onClose={() => setSceneImageAssetPickerOpen(null)}
					onSelect={(imageUrl, imageId) => {
						if (sceneImageAssetPickerOpen) {
							handleImportSceneImageFromAssets(sceneImageAssetPickerOpen, imageUrl, imageId);
						}
					}}
					title="Select Scene Image"
				/>

				{/* Video Asset Picker Modal for Scene Video */}
				<VideoAssetPickerModal
					isOpen={sceneVideoAssetPickerOpen !== null}
					onClose={() => setSceneVideoAssetPickerOpen(null)}
					onSelect={(videoUrl, videoId) => {
						if (sceneVideoAssetPickerOpen) {
							handleImportSceneVideoFromAssets(sceneVideoAssetPickerOpen, videoUrl, videoId);
						}
					}}
					title="Select Scene Video"
				/>
				</div>
			</div>

			{/* Right: Director Assistant (collapsible) */}
			{isAssistantCollapsed ? (
				<div className="w-12 border-l border-border flex-shrink-0 flex flex-col items-center py-4 bg-background">
					<button
						onClick={() => setIsAssistantCollapsed(false)}
						className="p-2 rounded-lg hover:bg-purple-500/20 transition-colors"
						title="Expand Assistant"
					>
						<MessageSquare className="h-5 w-5 text-purple-400" />
					</button>
					<span className="text-xs text-muted-foreground mt-2 [writing-mode:vertical-rl] rotate-180">
						Assistant
					</span>
				</div>
			) : (
				<div className="w-[400px] border-l border-border flex-shrink-0">
					<DirectorAssistantPanel onCollapse={() => setIsAssistantCollapsed(true)} />
				</div>
			)}
		</div>
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
	isImageQueued: boolean;
	isAudioQueued: boolean;
	isVideoQueued: boolean;
	// Asset picker menu state
	isImageUploadMenuOpen: boolean;
	isVideoUploadMenuOpen: boolean;
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
	onToggleCharacterReference: (sceneId: string, useCharacterReference: boolean) => void;
	onGenerateImage: (sceneId: string) => void;
	onGenerateAudio: (sceneId: string) => void;
	onGenerateVideo: (sceneId: string) => void;
	onPlayAudio: (sceneId: string) => void;
	onReorder: (fromIndex: number, toIndex: number) => void;
	onDelete: (sceneId: string) => void;
	// Asset picker handlers
	onOpenImageAssetPicker: (sceneId: string) => void;
	onToggleImageUploadMenu: (sceneId: string | null) => void;
	onOpenVideoAssetPicker: (sceneId: string) => void;
	onToggleVideoUploadMenu: (sceneId: string | null) => void;
	// Sound effect handlers
	onSoundEffectPromptChange: (sceneId: string, prompt: string) => void;
	onSoundEffectOffsetChange: (sceneId: string, offset: number) => void;
	onGenerateSoundEffect: (sceneId: string, prompt: string, duration: number) => void;
	onMergeSoundEffect: (sceneId: string, offset: number) => void;
}

function SceneCard({
	scene,
	index,
	totalScenes,
	isSettingsExpanded,
	playingSceneId,
	hasCharacterImage,
	isImageQueued,
	isAudioQueued,
	isVideoQueued,
	isImageUploadMenuOpen,
	isVideoUploadMenuOpen,
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
	onToggleCharacterReference,
	onGenerateImage,
	onGenerateAudio,
	onGenerateVideo,
	onPlayAudio,
	onReorder,
	onDelete,
	onOpenImageAssetPicker,
	onToggleImageUploadMenu,
	onOpenVideoAssetPicker,
	onToggleVideoUploadMenu,
	onSoundEffectPromptChange,
	onSoundEffectOffsetChange,
	onGenerateSoundEffect,
	onMergeSoundEffect,
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

				{/* Scene content - Vertical flow: Left (prompt + button) | Right (preview) */}
				<div className="space-y-4">
					{/* === IMAGE SECTION === */}
					<div className="flex gap-6">
						{/* Left: Image Prompt + Generate Button */}
						<div className="flex-1 flex flex-col">
							<label className="block text-sm font-medium text-muted-foreground mb-2">Image Prompt</label>
							<textarea
								value={scene.imagePrompt}
								onChange={(e) => onImagePromptChange(scene.id, e.target.value)}
								className="flex-1 min-h-[100px] px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-purple-500 resize-none"
								placeholder="Describe what should appear in this scene's image..."
							/>
							<div className="flex items-center gap-3 mt-3">
								<Button
									onClick={() => onGenerateImage(scene.id)}
									disabled={scene.isGeneratingImage || isImageQueued || !scene.imagePrompt.trim()}
									size="sm"
									className={isImageQueued ? "bg-gradient-to-r from-amber-500 to-orange-500" : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-muted disabled:to-muted"}
								>
									{scene.isGeneratingImage ? (
										<><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating...</>
									) : isImageQueued ? (
										<><Loader2 className="w-4 h-4 animate-spin mr-2" />Queued</>
									) : (
										<><ImageIcon className="w-4 h-4 mr-2" />{scene.imageUrl ? "Regenerate" : "Generate"}</>
									)}
								</Button>
								{/* Use Assets dropdown for image */}
								<div className="relative">
									<Button
										variant="secondary"
										size="sm"
										onClick={() => onToggleImageUploadMenu(isImageUploadMenuOpen ? null : scene.id)}
										disabled={scene.isGeneratingImage}
									>
										<FolderOpen className="w-4 h-4 mr-1" />
										<ChevronDown className="w-3 h-3" />
									</Button>
									{isImageUploadMenuOpen && (
										<div className="absolute top-full left-0 mt-1 w-44 bg-card border border-border rounded-lg shadow-xl z-10 overflow-hidden">
											<button
												type="button"
												onClick={() => {
													onOpenImageAssetPicker(scene.id);
													onToggleImageUploadMenu(null);
												}}
												className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent transition-colors flex items-center gap-2"
											>
												<FolderOpen className="w-4 h-4 text-purple-400" />
												From Asset Library
											</button>
										</div>
									)}
								</div>
								{/* Character Reference Checkbox */}
								<label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
									<input
										type="checkbox"
										checked={scene.useCharacterReference}
										onChange={(e) => onToggleCharacterReference(scene.id, e.target.checked)}
										disabled={!hasCharacterImage}
										className="w-4 h-4 rounded border-border bg-background text-purple-500 focus:ring-purple-500 disabled:opacity-50"
									/>
									<span className={!hasCharacterImage ? "opacity-50" : ""}>
										Use Character
									</span>
								</label>
								<CountdownProgress isActive={scene.isGeneratingImage} durationSeconds={30} />
							</div>
						</div>
						{/* Right: Image Preview (larger) */}
						<div className="w-56 shrink-0">
							<label className="block text-sm font-medium text-muted-foreground mb-2">Preview</label>
							{scene.imageUrl ? (
								<img src={scene.imageUrl} alt={`Scene ${index + 1}`} className="w-full rounded-lg object-cover shadow-lg" style={{ aspectRatio: "16/9" }} />
							) : (
								<div className="w-full bg-muted border border-border rounded-lg flex items-center justify-center" style={{ aspectRatio: "16/9" }}>
									<ImageIcon className="w-8 h-8 text-muted-foreground opacity-50" />
								</div>
							)}
						</div>
					</div>

					<div className="border-t border-border" />

					{/* === AUDIO SECTION (shorter height) === */}
					<div className="flex gap-6 items-start">
						{/* Left: Caption + Generate Button */}
						<div className="flex-1 flex flex-col">
							<label className="block text-sm font-medium text-muted-foreground mb-2">Caption / Narration</label>
							<textarea
								value={scene.caption}
								onChange={(e) => onCaptionChange(scene.id, e.target.value)}
								className="h-16 px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-emerald-500 resize-none"
								placeholder="Enter the narration text for this scene..."
							/>
							<div className="flex items-center gap-3 mt-3">
								<Button
									onClick={() => onGenerateAudio(scene.id)}
									disabled={scene.isGeneratingAudio || isAudioQueued || !scene.caption.trim()}
									size="sm"
									variant="outline"
									className={isAudioQueued ? "border-amber-500/50 text-amber-400" : ""}
								>
									{scene.isGeneratingAudio ? (
										<><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating...</>
									) : isAudioQueued ? (
										<><Loader2 className="w-4 h-4 animate-spin mr-2" />Queued</>
									) : (
										<><Volume2 className="w-4 h-4 mr-2" />{scene.audioUrl ? "Regenerate" : "Generate"} Audio</>
									)}
								</Button>
							</div>
						</div>
						{/* Right: Audio controls (compact) */}
						<div className="w-56 shrink-0">
							<label className="block text-sm font-medium text-muted-foreground mb-2">Audio</label>
							<div className="h-16 bg-muted border border-border rounded-lg flex items-center justify-center gap-4 px-4">
								{scene.audioUrl ? (
									<>
										<Button
											onClick={() => onPlayAudio(scene.id)}
											size="sm"
											variant={playingSceneId === scene.id ? "default" : "outline"}
										>
											{playingSceneId === scene.id ? (
												<><Volume2 className="w-4 h-4 mr-1" />Playing</>
											) : (
												<><Play className="w-4 h-4 mr-1" />Play</>
											)}
										</Button>
										{scene.audioDuration && (
											<span className="text-sm text-muted-foreground font-medium">
												{Math.floor(scene.audioDuration / 60)}:{String(Math.floor(scene.audioDuration % 60)).padStart(2, '0')}
											</span>
										)}
									</>
								) : (
									<span className="text-sm text-muted-foreground">No audio yet</span>
								)}
							</div>
						</div>
					</div>

					<div className="border-t border-border" />

					{/* === VIDEO SECTION === */}
					<div className="flex gap-6">
						{/* Left: Video Instruction + Generate Button */}
						<div className="flex-1 flex flex-col">
							<div className="flex items-center justify-between mb-2">
								<label className="text-sm font-medium text-muted-foreground">Video Instruction</label>
								<label className="flex items-center gap-2 cursor-pointer">
									<input
										type="checkbox"
										checked={scene.useAvatar || false}
										onChange={(e) => onToggleAvatarMode(scene.id, e.target.checked)}
										className="w-4 h-4 rounded border-border text-purple-500 focus:ring-purple-500 accent-purple-500"
									/>
									<span className="text-xs text-purple-400 font-medium">Avatar Speak</span>
								</label>
							</div>
							<textarea
								value={scene.videoPrompt}
								onChange={(e) => onVideoPromptChange(scene.id, e.target.value)}
								disabled={scene.useAvatar || false}
								className={`flex-1 min-h-[100px] px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-indigo-500 resize-none ${scene.useAvatar ? "opacity-50 cursor-not-allowed" : ""}`}
								placeholder={scene.useAvatar ? "Avatar mode uses character image + audio (no video prompt needed)" : "Describe camera movement and action..."}
							/>
							{scene.videoError && <InlineError error={scene.videoError} />}
							<div className="flex items-center gap-3 mt-3">
								<Button
									onClick={() => onGenerateVideo(scene.id)}
									disabled={scene.isGeneratingVideo || isVideoQueued || !scene.imageUrl || !scene.audioUrl}
									size="sm"
									className={isVideoQueued ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400" : "bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 disabled:from-muted disabled:to-muted"}
								>
									{scene.isGeneratingVideo ? (
										<><Loader2 className="w-4 h-4 animate-spin mr-2" />Generating...</>
									) : isVideoQueued ? (
										<><Loader2 className="w-4 h-4 animate-spin mr-2" />Queued</>
									) : (
										<><Film className="w-4 h-4 mr-2" />{scene.videoUrl ? "Regenerate" : "Generate"}</>
									)}
								</Button>
								{/* Use Assets dropdown for video */}
								<div className="relative">
									<Button
										variant="secondary"
										size="sm"
										onClick={() => onToggleVideoUploadMenu(isVideoUploadMenuOpen ? null : scene.id)}
										disabled={scene.isGeneratingVideo}
									>
										<FolderOpen className="w-4 h-4 mr-1" />
										<ChevronDown className="w-3 h-3" />
									</Button>
									{isVideoUploadMenuOpen && (
										<div className="absolute top-full left-0 mt-1 w-44 bg-card border border-border rounded-lg shadow-xl z-10 overflow-hidden">
											<button
												type="button"
												onClick={() => {
													onOpenVideoAssetPicker(scene.id);
													onToggleVideoUploadMenu(null);
												}}
												className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent transition-colors flex items-center gap-2"
											>
												<FolderOpen className="w-4 h-4 text-indigo-400" />
												From Asset Library
											</button>
										</div>
									)}
								</div>
								<CountdownProgress isActive={scene.isGeneratingVideo} durationSeconds={120} />
							</div>
						</div>
						{/* Right: Video Preview (larger) */}
						<div className="w-56 shrink-0">
							<label className="block text-sm font-medium text-muted-foreground mb-2">Preview</label>
							{scene.videoUrl ? (
								<video src={scene.videoUrl} data-scene-id={scene.id} className="w-full rounded-lg object-cover shadow-lg" style={{ aspectRatio: "16/9" }} controls muted />
							) : (
								<div className="w-full bg-muted border border-border rounded-lg flex items-center justify-center" style={{ aspectRatio: "16/9" }}>
									<Film className="w-8 h-8 text-muted-foreground opacity-50" />
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Sound Effect Section - shown after video + audio completed */}
				{scene.videoUrl && scene.audioUrl && (
					<div className="mt-6 pt-6 border-t border-border">
						<h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
							<Volume2 className="w-4 h-4 text-indigo-400" />
							Sound Effect
						</h4>

						{/* Sound Effect Prompt Input */}
						<div className="flex gap-3">
							<input
								type="text"
								value={scene.soundEffectPrompt || ""}
								onChange={(e) => onSoundEffectPromptChange(scene.id, e.target.value)}
								placeholder="Describe sound effect (e.g., footsteps, wind, rain)..."
								disabled={scene.isGeneratingSoundEffect || scene.isMergingSoundEffect}
								className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors disabled:opacity-50"
							/>
							<Button
								onClick={() => onGenerateSoundEffect(scene.id, scene.soundEffectPrompt || "", scene.videoDuration || 5)}
								disabled={!scene.soundEffectPrompt?.trim() || scene.isGeneratingSoundEffect}
								className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 disabled:from-muted disabled:to-muted disabled:cursor-not-allowed text-foreground font-semibold rounded-lg transition-all duration-300 flex items-center gap-2"
							>
								{scene.isGeneratingSoundEffect ? (
									<>
										<Loader2 className="w-4 h-4 animate-spin" />
										Generating...
									</>
								) : (
									<>
										<Sparkles className="w-4 h-4" />
										{scene.soundEffectUrl ? "Regenerate" : "Generate"}
									</>
								)}
							</Button>
						</div>

						{/* Waveform and Controls - shown after sound effect generated */}
						{scene.soundEffectUrl && scene.videoDuration && (
							<div className="mt-4">
								<SoundEffectWaveform
									audioUrl={scene.soundEffectUrl}
									duration={scene.soundEffectDuration || 5}
									videoDuration={scene.videoDuration}
									offset={scene.soundEffectOffset || 0}
									onOffsetChange={(newOffset) => onSoundEffectOffsetChange(scene.id, newOffset)}
									disabled={scene.isMergingSoundEffect}
								/>

								{/* Preview and Merge buttons */}
								<div className="mt-3 flex gap-3">
									<Button
										variant="outline"
										onClick={() => {
											// Preview: play video and sound effect with offset
											const video = document.querySelector<HTMLVideoElement>(
												`video[data-scene-id="${scene.id}"]`,
											);
											const audio = new Audio(scene.soundEffectUrl || "");
											if (video) {
												video.currentTime = 0;
												video.play();
												const offset = scene.soundEffectOffset || 0;
												if (offset > 0) {
													setTimeout(() => audio.play(), offset * 1000);
												} else {
													audio.play();
												}
												video.addEventListener("ended", () => audio.pause(), { once: true });
											}
										}}
										className="flex-1 py-2 h-auto font-semibold rounded-lg flex items-center justify-center gap-2"
									>
										<Play className="w-4 h-4" />
										Preview
									</Button>
									<Button
										onClick={() => onMergeSoundEffect(scene.id, scene.soundEffectOffset || 0)}
										disabled={scene.isMergingSoundEffect}
										className="flex-1 py-2 h-auto bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:from-muted disabled:to-muted disabled:cursor-not-allowed text-foreground font-semibold rounded-lg flex items-center justify-center gap-2"
									>
										{scene.isMergingSoundEffect ? (
											<>
												<Loader2 className="w-4 h-4 animate-spin" />
												Merging...
											</>
										) : (
											<>
												<Film className="w-4 h-4" />
												Add Sound Effect
											</>
										)}
									</Button>
								</div>
							</div>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
