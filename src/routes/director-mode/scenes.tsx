import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import {
	Captions,
	ChevronDown,
	ChevronUp,
	Clapperboard,
	Download,
	Film,
	ImageIcon,
	Loader2,
	Play,
	Plus,
	Settings,
	Trash2,
	User,
	Volume2,
} from "lucide-react";
import { useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { CountdownProgress } from "@/components/countdown-progress";
import { ErrorWithRetry, InlineError } from "@/components/error-with-retry";
import {
	useGenerateDirectorSceneImage,
	useGenerateDirectorSceneAudio,
	useGenerateDirectorSceneVideo,
	useGenerateDirectorAvatarVideo,
	useUpdateDirectorScene,
	useReorderDirectorScenes,
} from "@/hooks/use-director-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	directorActions,
	directorStore,
	type DirectorAvatarEngine,
	type DirectorImageEngine,
	type DirectorSceneState,
	type DirectorVideoEngine,
	type DirectorVoiceId,
} from "@/stores/director.store";

// ============================================================================
// Options (matching index.tsx)
// ============================================================================

const IMAGE_ENGINES: { id: DirectorImageEngine; label: string }[] = [
	{ id: "flux-pro", label: "Flux Pro" },
	{ id: "gpt-image-1.5", label: "GPT Image 1.5" },
	{ id: "nano-banana-pro", label: "Nano Banana Pro" },
];

const VIDEO_ENGINES: { id: DirectorVideoEngine; label: string }[] = [
	{ id: "kling-video", label: "Kling v2.6 Pro" },
	{ id: "sora-2", label: "Sora 2" },
	{ id: "ltx-2-19b", label: "LTX-2 19B" },
	{ id: "veo3.1", label: "Veo 3.1" },
	{ id: "veo3.1-fast", label: "Veo 3.1 Fast" },
];

const AVATAR_ENGINES: { id: DirectorAvatarEngine; label: string }[] = [
	{ id: "omnihuman", label: "Omnihuman" },
	{ id: "aurora", label: "Aurora" },
];

const VOICE_OPTIONS: { id: DirectorVoiceId; label: string }[] = [
	{ id: "PIGsltMj3gFMR34aFDI3", label: "Jonathan" },
	{ id: "Z3R5wn05IrDiVCyEkUrK", label: "Arabella" },
	{ id: "n1PvBOwxb8X6m7tahp2h", label: "Michael" },
	{ id: "ZF6FPAbjXT4488VcRRnw", label: "Amelia" },
	{ id: "ICwKbPHDHAM3eal5tHEZ", label: "Tony" },
	{ id: "cgLpYGyXZhkyalKZ0xeZ", label: "Knox" },
	{ id: "YKrm0N1EAM9Bw27j8kuD", label: "Leonidas" },
];

// ============================================================================
// Route
// ============================================================================

export const Route = createFileRoute("/director-mode/scenes")({
	beforeLoad: () => {
		const state = directorStore.state;
		if (!state.promptsGenerated || !state.character) {
			throw redirect({ to: "/director-mode" });
		}
	},
	component: DirectorScenesPage,
});

// ============================================================================
// Component
// ============================================================================

function DirectorScenesPage() {
	const navigate = useNavigate();

	// React Query mutations
	const generateSceneImageMutation = useGenerateDirectorSceneImage();
	const generateSceneAudioMutation = useGenerateDirectorSceneAudio();
	const generateSceneVideoMutation = useGenerateDirectorSceneVideo();
	const generateAvatarVideoMutation = useGenerateDirectorAvatarVideo();
	const updateSceneMutation = useUpdateDirectorScene();
	const reorderScenesMutation = useReorderDirectorScenes();

	// Subscribe to store state
	const storyId = useStore(directorStore, (s) => s.storyId);
	const character = useStore(directorStore, (s) => s.character);
	const scenes = useStore(directorStore, (s) => s.scenes);
	const defaultImageEngine = useStore(directorStore, (s) => s.defaultImageEngine);
	const defaultVideoEngine = useStore(directorStore, (s) => s.defaultVideoEngine);
	const defaultAvatarEngine = useStore(directorStore, (s) => s.defaultAvatarEngine);
	const defaultVoiceId = useStore(directorStore, (s) => s.defaultVoiceId);
	const defaultVoiceSpeed = useStore(directorStore, (s) => s.defaultVoiceSpeed);
	const defaultImageStyle = useStore(directorStore, (s) => s.defaultImageStyle);
	const sceneError = useStore(directorStore, (s) => s.sceneError);
	const playingSceneId = useStore(directorStore, (s) => s.playingSceneId);
	const exportedVideoUrl = useStore(directorStore, (s) => s.exportedVideoUrl);
	const isGeneratingAllImages = useStore(directorStore, (s) => s.isGeneratingAllImages);
	const isGeneratingAllAudios = useStore(directorStore, (s) => s.isGeneratingAllAudios);
	const isGeneratingAllVideos = useStore(directorStore, (s) => s.isGeneratingAllVideos);
	const batchProgress = useStore(directorStore, (s) => s.batchProgress);

	// Local state
	const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
	const [expandedSceneSettings, setExpandedSceneSettings] = useState<Set<string>>(new Set());
	const [currentWordIndex, setCurrentWordIndex] = useState<number | null>(null);

	// Refs
	const audioRef = useRef<HTMLAudioElement | null>(null);

	// Debounced save callbacks (1.5s delay)
	const debouncedSaveCaption = useDebouncedCallback((sceneId: string, caption: string) => {
		updateSceneMutation.mutate({ sceneId, updates: { caption } });
	}, 1500);

	const debouncedSaveImagePrompt = useDebouncedCallback((sceneId: string, imagePrompt: string) => {
		updateSceneMutation.mutate({ sceneId, updates: { imagePrompt } });
	}, 1500);

	const debouncedSaveVideoPrompt = useDebouncedCallback((sceneId: string, videoPrompt: string) => {
		updateSceneMutation.mutate({ sceneId, updates: { videoPrompt } });
	}, 1500);

	// Computed values
	const scenesNeedingImages = scenes.filter((s) => !s.imageId || s.imageStatus !== "completed");
	const scenesNeedingVideos = scenes.filter(
		(s) => s.imageId && s.audioId && (!s.videoId || s.videoStatus !== "completed")
	);
	const allImagesCompleted = scenes.every((s) => s.imageId && (s.imageStatus === "completed" || !s.imageStatus));
	const allScenesHaveVideos = scenes.length > 0 && scenes.every((s) => s.videoUrl && s.audioUrl);
	const hasAnyWordTimestamps = scenes.some((s) => s.wordTimestamps && s.wordTimestamps.length > 0);

	// Toggle scene settings expansion
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

	// Handle field updates (immediate store update + debounced save)
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

	// Handle per-scene engine changes (immediate save, no debounce)
	const handleSceneImageEngineChange = (sceneId: string, engine: DirectorImageEngine) => {
		directorActions.updateSceneImageEngine(sceneId, engine);
		updateSceneMutation.mutate({ sceneId, updates: { imageEngine: engine } });
	};

	const handleSceneVideoEngineChange = (sceneId: string, engine: DirectorVideoEngine) => {
		directorActions.updateSceneVideoEngine(sceneId, engine);
		updateSceneMutation.mutate({ sceneId, updates: { videoEngine: engine } });
	};

	const handleSceneAvatarEngineChange = (sceneId: string, engine: DirectorAvatarEngine | null) => {
		directorActions.updateSceneAvatarEngine(sceneId, engine);
		updateSceneMutation.mutate({ sceneId, updates: { avatarEngine: engine } });
	};

	const handleSceneVoiceChange = (sceneId: string, voiceId: DirectorVoiceId) => {
		directorActions.updateSceneVoice(sceneId, voiceId);
		updateSceneMutation.mutate({ sceneId, updates: { voiceId } });
	};

	const handleSceneVoiceSpeedChange = (sceneId: string, voiceSpeed: number) => {
		directorActions.updateSceneVoiceSpeed(sceneId, voiceSpeed);
		updateSceneMutation.mutate({ sceneId, updates: { voiceSpeed } });
	};

	const handleToggleAvatarMode = (sceneId: string, useAvatar: boolean) => {
		directorActions.toggleSceneAvatarMode(sceneId, useAvatar);
	};

	// Handle scene reorder
	const handleReorderScenes = (fromIndex: number, toIndex: number) => {
		directorActions.reorderScenes(fromIndex, toIndex);
		// Build scene order array for API
		if (storyId) {
			const newScenes = [...scenes];
			const [moved] = newScenes.splice(fromIndex, 1);
			newScenes.splice(toIndex, 0, moved);
			const sceneOrder = newScenes.map((s, i) => ({ sceneId: s.id, orderIndex: i }));
			reorderScenesMutation.mutate({ storyId, sceneOrder });
		}
	};

	// Generation handlers
	const handleGenerateSceneImage = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene || !storyId) return;

		directorActions.updateScene(sceneId, { isGeneratingImage: true });

		generateSceneImageMutation.mutate(
			{
				prompt: scene.imagePrompt,
				storyId,
				sceneId,
				characterImageUrl: character?.imageUrl || undefined,
				imageEngine: scene.imageEngine,
			},
			{
				onSuccess: (result) => {
					if (result.success && result.imageUrl) {
						directorActions.updateScene(sceneId, {
							isGeneratingImage: false,
							imageUrl: result.imageUrl,
							imageId: result.imageId || null,
							imageStatus: "completed",
						});
					} else {
						directorActions.updateScene(sceneId, { isGeneratingImage: false });
						directorActions.setSceneError(result.error || "Failed to generate image");
					}
				},
				onError: (err) => {
					directorActions.updateScene(sceneId, { isGeneratingImage: false });
					directorActions.setSceneError(
						err instanceof Error ? err.message : "Failed to generate image",
					);
				},
			},
		);
	};

	const handleGenerateSceneAudio = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene || !storyId) return;

		directorActions.updateScene(sceneId, { isGeneratingAudio: true });

		generateSceneAudioMutation.mutate(
			{
				caption: scene.caption,
				storyId,
				sceneId,
				voiceId: scene.voiceId,
				voiceSpeed: scene.voiceSpeed,
			},
			{
				onSuccess: (result) => {
					if (result.success && result.audioUrl) {
						directorActions.updateScene(sceneId, {
							isGeneratingAudio: false,
							audioUrl: result.audioUrl,
							audioId: result.audioId || null,
							audioDuration: result.audioDuration || null,
							audioStatus: "completed",
							wordTimestamps: result.wordTimestamps || null,
						});
					} else {
						directorActions.updateScene(sceneId, { isGeneratingAudio: false });
						directorActions.setSceneError(result.error || "Failed to generate audio");
					}
				},
				onError: (err) => {
					directorActions.updateScene(sceneId, { isGeneratingAudio: false });
					directorActions.setSceneError(
						err instanceof Error ? err.message : "Failed to generate audio",
					);
				},
			},
		);
	};

	const handleGenerateSceneVideo = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene || !storyId || !scene.imageUrl || !scene.audioUrl || !scene.audioDuration) return;

		directorActions.updateScene(sceneId, { isGeneratingVideo: true, videoError: null });

		// Choose between regular video or avatar video based on scene settings
		if (scene.useAvatar && character?.imageUrl) {
			// Use avatar video generation
			generateAvatarVideoMutation.mutate(
				{
					storyId,
					sceneId,
					characterImageUrl: character.imageUrl,
					avatarEngine: scene.avatarEngine || "omnihuman",
				},
				{
					onSuccess: (result) => {
						if (result.success && result.videoUrl) {
							directorActions.updateScene(sceneId, {
								isGeneratingVideo: false,
								videoUrl: result.videoUrl,
								videoId: result.videoId || null,
								videoDuration: result.videoDuration || null,
								videoStatus: "completed",
							});
						} else {
							directorActions.updateScene(sceneId, {
								isGeneratingVideo: false,
								videoError: result.error || "Failed to generate avatar video",
							});
						}
					},
					onError: (err) => {
						directorActions.updateScene(sceneId, {
							isGeneratingVideo: false,
							videoError: err instanceof Error ? err.message : "Failed to generate avatar video",
						});
					},
				},
			);
		} else {
			// Use regular video generation
			generateSceneVideoMutation.mutate(
				{
					storyId,
					sceneId,
					videoPrompt: scene.videoPrompt,
					imageUrl: scene.imageUrl,
					audioUrl: scene.audioUrl,
					audioDuration: scene.audioDuration,
					imageId: scene.imageId || "",
					audioId: scene.audioId || "",
					videoEngine: scene.videoEngine,
				},
				{
					onSuccess: (result) => {
						if (result.success && result.videoUrl) {
							directorActions.updateScene(sceneId, {
								isGeneratingVideo: false,
								videoUrl: result.videoUrl,
								videoId: result.videoId || null,
								videoDuration: result.videoDuration || null,
								videoStatus: "completed",
							});
						} else {
							directorActions.updateScene(sceneId, {
								isGeneratingVideo: false,
								videoError: result.error || "Failed to generate video",
							});
						}
					},
					onError: (err) => {
						directorActions.updateScene(sceneId, {
							isGeneratingVideo: false,
							videoError: err instanceof Error ? err.message : "Failed to generate video",
						});
					},
				},
			);
		}
	};

	// Play scene audio
	const handlePlaySceneAudio = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene?.audioUrl) return;

		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current = null;
		}

		const audio = new Audio(scene.audioUrl);
		audioRef.current = audio;
		directorActions.setPlayingSceneId(sceneId);
		setCurrentWordIndex(scene.wordTimestamps?.length ? 0 : null);

		if (scene.wordTimestamps?.length) {
			audio.addEventListener("timeupdate", () => {
				const currentTime = audio.currentTime;
				const idx = scene.wordTimestamps?.findIndex(
					(wt) => currentTime >= wt.startTime && currentTime < wt.endTime
				) ?? -1;
				if (idx !== -1) setCurrentWordIndex(idx);
			});
		}

		audio.addEventListener("ended", () => {
			directorActions.setPlayingSceneId(null);
			setCurrentWordIndex(null);
			audioRef.current = null;
		});

		audio.play();
	};

	// Download exported video
	const handleDownloadExportedVideo = async () => {
		if (!exportedVideoUrl) return;
		try {
			const response = await fetch(exportedVideoUrl);
			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = blobUrl;
			link.download = `director_mode_${Date.now()}.mp4`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(blobUrl);
		} catch (error) {
			console.error("Download failed:", error);
		}
	};

	// Batch generation handlers - generate one at a time sequentially
	const handleGenerateAllImages = async () => {
		if (!storyId) return;

		directorActions.setIsGeneratingAllImages(true);
		directorActions.setBatchProgress({ current: 0, total: scenesNeedingImages.length, type: "images" });

		for (let i = 0; i < scenesNeedingImages.length; i++) {
			const scene = scenesNeedingImages[i];
			directorActions.setBatchProgress({ current: i + 1, total: scenesNeedingImages.length, type: "images" });
			directorActions.updateScene(scene.id, { isGeneratingImage: true });

			try {
				const result = await generateSceneImageMutation.mutateAsync({
					prompt: scene.imagePrompt,
					storyId,
					sceneId: scene.id,
					characterImageUrl: character?.imageUrl || undefined,
					imageEngine: scene.imageEngine,
				});

				if (result.success && result.imageUrl) {
					directorActions.updateScene(scene.id, {
						isGeneratingImage: false,
						imageUrl: result.imageUrl,
						imageId: result.imageId || null,
						imageStatus: "completed",
					});
				} else {
					directorActions.updateScene(scene.id, { isGeneratingImage: false });
				}
			} catch (err) {
				directorActions.updateScene(scene.id, { isGeneratingImage: false });
			}
		}

		directorActions.setIsGeneratingAllImages(false);
		directorActions.setBatchProgress(null);
	};

	const handleGenerateAllAudios = async () => {
		if (!storyId) return;

		const scenesNeedingAudio = scenes.filter((s) => !s.audioId || s.audioStatus !== "completed");
		directorActions.setIsGeneratingAllAudios(true);
		directorActions.setBatchProgress({ current: 0, total: scenesNeedingAudio.length, type: "audios" });

		for (let i = 0; i < scenesNeedingAudio.length; i++) {
			const scene = scenesNeedingAudio[i];
			directorActions.setBatchProgress({ current: i + 1, total: scenesNeedingAudio.length, type: "audios" });
			directorActions.updateScene(scene.id, { isGeneratingAudio: true });

			try {
				const result = await generateSceneAudioMutation.mutateAsync({
					caption: scene.caption,
					storyId,
					sceneId: scene.id,
					voiceId: scene.voiceId,
					voiceSpeed: scene.voiceSpeed,
				});

				if (result.success && result.audioUrl) {
					directorActions.updateScene(scene.id, {
						isGeneratingAudio: false,
						audioUrl: result.audioUrl,
						audioId: result.audioId || null,
						audioDuration: result.audioDuration || null,
						audioStatus: "completed",
						wordTimestamps: result.wordTimestamps || null,
					});
				} else {
					directorActions.updateScene(scene.id, { isGeneratingAudio: false });
				}
			} catch (err) {
				directorActions.updateScene(scene.id, { isGeneratingAudio: false });
			}
		}

		directorActions.setIsGeneratingAllAudios(false);
		directorActions.setBatchProgress(null);
	};

	const handleGenerateAllVideos = async () => {
		if (!storyId) return;

		directorActions.setIsGeneratingAllVideos(true);
		directorActions.setBatchProgress({ current: 0, total: scenesNeedingVideos.length, type: "videos" });

		for (let i = 0; i < scenesNeedingVideos.length; i++) {
			const scene = scenesNeedingVideos[i];
			if (!scene.imageUrl || !scene.audioUrl || !scene.audioDuration) continue;

			directorActions.setBatchProgress({ current: i + 1, total: scenesNeedingVideos.length, type: "videos" });
			directorActions.updateScene(scene.id, { isGeneratingVideo: true, videoError: null });

			try {
				let result;
				if (scene.useAvatar && character?.imageUrl) {
					result = await generateAvatarVideoMutation.mutateAsync({
						storyId,
						sceneId: scene.id,
						characterImageUrl: character.imageUrl,
						avatarEngine: scene.avatarEngine || "omnihuman",
					});
				} else {
					result = await generateSceneVideoMutation.mutateAsync({
						storyId,
						sceneId: scene.id,
						videoPrompt: scene.videoPrompt,
						imageUrl: scene.imageUrl,
						audioUrl: scene.audioUrl,
						audioDuration: scene.audioDuration,
						imageId: scene.imageId || "",
						audioId: scene.audioId || "",
						videoEngine: scene.videoEngine,
					});
				}

				if (result.success && result.videoUrl) {
					directorActions.updateScene(scene.id, {
						isGeneratingVideo: false,
						videoUrl: result.videoUrl,
						videoId: result.videoId || null,
						videoDuration: result.videoDuration || null,
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

	const scenesDisabled = !character?.imageUrl;

	return (
		<div className="space-y-8">
			{/* Default Engine Settings Display */}
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

					{/* Expanded settings with Apply to All */}
					{isSettingsExpanded && (
						<div className="mt-4 pt-4 border-t border-border">
							<Button variant="outline" onClick={() => directorActions.applyDefaultsToAllScenes()} className="mb-4">
								Apply Defaults to All Scenes
							</Button>
							<p className="text-xs text-muted-foreground">
								This will reset all per-scene engine settings to match the defaults. Go back to setup page to change defaults.
							</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Character Display (read-only on scenes page) */}
			<Card>
				<CardContent className="p-6">
					<h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
						<User className="w-5 h-5 text-cyan-400" />
						Character Reference (16:9)
					</h3>
					<div className="flex gap-6">
						<div className="flex-1 min-w-0">
							<p className="text-muted-foreground text-sm">{character?.imagePrompt || "No prompt"}</p>
						</div>
						<div className="w-64 flex-shrink-0">
							{character?.imageUrl ? (
								<img src={character.imageUrl} alt="Character" className="w-full rounded-lg shadow-lg object-cover" style={{ aspectRatio: "16/9" }} />
							) : (
								<div className="w-full bg-muted border border-border rounded-lg flex items-center justify-center text-muted-foreground" style={{ aspectRatio: "16/9" }}>
									<ImageIcon className="w-8 h-8 opacity-50" />
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
					{scenesDisabled && (
						<div className="p-4 bg-amber-500/20 border border-amber-500/50 rounded-xl text-amber-300 text-center">
							Please generate or upload a character image first to enable scene editing
						</div>
					)}

					{scenes.map((scene, index) => (
						<SceneCard
							key={scene.id}
							scene={scene}
							index={index}
							totalScenes={scenes.length}
							disabled={scenesDisabled}
							isSettingsExpanded={expandedSceneSettings.has(scene.id)}
							playingSceneId={playingSceneId}
							currentWordIndex={currentWordIndex}
							characterImageUrl={character?.imageUrl || null}
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
						disabled={scenesDisabled}
						className="w-full py-4 h-auto border-2 border-dashed border-border hover:border-purple-500 rounded-xl text-muted-foreground hover:text-purple-400 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
					>
						<Plus className="w-5 h-5" />
						Add New Scene
					</Button>
				</div>
			)}

			{/* Empty state - Add first scene */}
			{scenes.length === 0 && !scenesDisabled && (
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
			{(hasAnyWordTimestamps || allScenesHaveVideos) && (
				<div className="mt-8 flex flex-col gap-3">
					{hasAnyWordTimestamps && (
						<Button
							onClick={() => navigate({ to: "/director-mode/subtitles" })}
							variant="outline"
							className="w-full py-4 h-auto border-2 border-cyan-500/50 hover:border-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 text-lg font-bold rounded-xl"
						>
							<Captions className="w-6 h-6 mr-3" />
							編輯字幕
						</Button>
					)}
					{allScenesHaveVideos && (
						<Button
							onClick={() => navigate({ to: "/director-mode/export" })}
							className="w-full py-4 h-auto bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-foreground text-lg font-bold rounded-xl shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50"
						>
							<Film className="w-6 h-6 mr-3" />
							GO TO EXPORT
						</Button>
					)}
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
	disabled: boolean;
	isSettingsExpanded: boolean;
	playingSceneId: string | null;
	currentWordIndex: number | null;
	characterImageUrl: string | null;
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
	disabled,
	isSettingsExpanded,
	playingSceneId,
	currentWordIndex,
	characterImageUrl,
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
		<Card className={disabled ? "opacity-50 pointer-events-none" : ""}>
			<CardContent className="p-6">
				{/* Scene header */}
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
						<Clapperboard className="w-5 h-5 text-purple-400" />
						Scene {index + 1}
					</h3>
					<div className="flex items-center gap-3">
						{/* Per-scene settings toggle */}
						<button
							type="button"
							onClick={onToggleSettings}
							className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${isSettingsExpanded ? "bg-purple-500/20 text-purple-400" : "text-muted-foreground hover:text-foreground"}`}
						>
							<Settings className="w-3 h-3" />
							Engine
							{isSettingsExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
						</button>
						{/* Reorder buttons */}
						<div className="flex items-center gap-1">
							<button type="button" onClick={() => onReorder(index, index - 1)} disabled={index === 0} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
								<ChevronUp className="w-4 h-4" />
							</button>
							<button type="button" onClick={() => onReorder(index, index + 1)} disabled={index === totalScenes - 1} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
								<ChevronDown className="w-4 h-4" />
							</button>
						</div>
						{/* Delete button */}
						<button type="button" onClick={() => onDelete(scene.id)} disabled={totalScenes <= 1} className="p-1 text-red-400 hover:text-red-300 disabled:opacity-30 transition-colors">
							<Trash2 className="w-4 h-4" />
						</button>
					</div>
				</div>

				{/* Per-scene engine settings (collapsible) */}
				{isSettingsExpanded && (
					<div className="mb-4 p-4 bg-muted/50 border border-border rounded-lg">
						<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
							{/* Image Engine */}
							<div>
								<label className="block text-xs text-muted-foreground mb-1">Image Engine</label>
								<select
									value={scene.imageEngine}
									onChange={(e) => onImageEngineChange(scene.id, e.target.value as DirectorImageEngine)}
									className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm focus:outline-none focus:border-cyan-500"
								>
									{IMAGE_ENGINES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
								</select>
							</div>
							{/* Voice */}
							<div>
								<label className="block text-xs text-muted-foreground mb-1">Voice</label>
								<select
									value={scene.voiceId}
									onChange={(e) => onVoiceChange(scene.id, e.target.value)}
									className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm focus:outline-none focus:border-emerald-500"
								>
									{VOICE_OPTIONS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
								</select>
							</div>
							{/* Voice Speed */}
							<div>
								<label className="block text-xs text-muted-foreground mb-1">Speed</label>
								<select
									value={scene.voiceSpeed}
									onChange={(e) => onVoiceSpeedChange(scene.id, Number.parseFloat(e.target.value))}
									className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm focus:outline-none focus:border-emerald-500"
								>
									<option value={0.7}>0.7x</option>
									<option value={0.8}>0.8x</option>
									<option value={0.9}>0.9x</option>
									<option value={1.0}>1.0x</option>
									<option value={1.1}>1.1x</option>
									<option value={1.2}>1.2x</option>
								</select>
							</div>
							{/* Video Mode Toggle */}
							<div>
								<label className="block text-xs text-muted-foreground mb-1">Video Mode</label>
								<div className="flex gap-1">
									<button
										type="button"
										onClick={() => onToggleAvatarMode(scene.id, false)}
										className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${!scene.useAvatar ? "bg-purple-500 text-white" : "bg-muted text-muted-foreground"}`}
									>
										Regular
									</button>
									<button
										type="button"
										onClick={() => onToggleAvatarMode(scene.id, true)}
										className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-colors ${scene.useAvatar ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground"}`}
									>
										Avatar
									</button>
								</div>
							</div>
						</div>
						{/* Second row: Video/Avatar Engine */}
						<div className="mt-3 grid grid-cols-2 gap-4">
							{!scene.useAvatar ? (
								<div>
									<label className="block text-xs text-muted-foreground mb-1">Video Engine</label>
									<select
										value={scene.videoEngine}
										onChange={(e) => onVideoEngineChange(scene.id, e.target.value as DirectorVideoEngine)}
										className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm focus:outline-none focus:border-purple-500"
									>
										{VIDEO_ENGINES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
									</select>
								</div>
							) : (
								<div>
									<label className="block text-xs text-muted-foreground mb-1">Avatar Engine</label>
									<select
										value={scene.avatarEngine || "omnihuman"}
										onChange={(e) => onAvatarEngineChange(scene.id, e.target.value as DirectorAvatarEngine)}
										className="w-full px-2 py-1.5 bg-background border border-border rounded text-sm focus:outline-none focus:border-indigo-500"
									>
										{AVATAR_ENGINES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
									</select>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Two-column layout: left inputs, right previews */}
				<div className="flex gap-6">
					{/* Left side: prompts and generation buttons */}
					<div className="flex-1 min-w-0 space-y-4">
						{/* Image Prompt */}
						<div>
							<label className="block text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Image Prompt</label>
							<textarea
								value={scene.imagePrompt}
								onChange={(e) => onImagePromptChange(scene.id, e.target.value)}
								className="w-full h-24 px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-purple-500 resize-none"
								placeholder="Describe the scene visuals..."
								disabled={scene.isGeneratingImage}
							/>
							<CountdownProgress isActive={scene.isGeneratingImage} durationSeconds={60} />
							<Button
								onClick={() => onGenerateImage(scene.id)}
								disabled={!scene.imagePrompt.trim() || scene.isGeneratingImage}
								className={`${scene.isGeneratingImage ? "" : "mt-2"} w-full py-2 h-auto bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-muted disabled:to-muted font-semibold rounded-lg flex items-center justify-center gap-2`}
							>
								{scene.isGeneratingImage ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</> : <><ImageIcon className="w-4 h-4" />{scene.imageUrl ? "REGENERATE IMAGE" : "GENERATE IMAGE"}</>}
							</Button>
						</div>

						{/* Caption (Narration) */}
						<div>
							<label className="block text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Caption (Narration)</label>
							<textarea
								value={scene.caption}
								onChange={(e) => onCaptionChange(scene.id, e.target.value)}
								className="w-full h-20 px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-emerald-500 resize-none"
								placeholder="Enter narration text..."
								disabled={scene.isGeneratingAudio}
							/>
							<Button
								onClick={() => onGenerateAudio(scene.id)}
								disabled={!scene.caption.trim() || scene.isGeneratingAudio}
								className="mt-2 w-full py-2 h-auto bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:from-muted disabled:to-muted font-semibold rounded-lg flex items-center justify-center gap-2"
							>
								{scene.isGeneratingAudio ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</> : <><Volume2 className="w-4 h-4" />{scene.audioUrl ? "REGENERATE AUDIO" : "GENERATE AUDIO"}</>}
							</Button>
						</div>

						{/* Video Prompt */}
						<div>
							<label className="block text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Video Instruction</label>
							<textarea
								value={scene.videoPrompt}
								onChange={(e) => onVideoPromptChange(scene.id, e.target.value)}
								className="w-full h-20 px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-indigo-500 resize-none"
								placeholder="Describe camera movement, actions, effects..."
								disabled={scene.isGeneratingVideo}
							/>
							{scene.videoError && (
								<InlineError error={scene.videoError} onRetry={() => onGenerateVideo(scene.id)} onDismiss={() => directorActions.updateScene(scene.id, { videoError: null })} isRetrying={scene.isGeneratingVideo} />
							)}
							<CountdownProgress isActive={scene.isGeneratingVideo} durationSeconds={180} />
							<Button
								onClick={() => onGenerateVideo(scene.id)}
								disabled={!scene.videoPrompt.trim() || !scene.imageUrl || !scene.audioDuration || scene.isGeneratingVideo}
								title={!scene.audioDuration ? "Generate audio first" : undefined}
								className={`${scene.isGeneratingVideo ? "" : "mt-2"} w-full py-2 h-auto bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 disabled:from-muted disabled:to-muted font-semibold rounded-lg flex items-center justify-center gap-2`}
							>
								{scene.isGeneratingVideo ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</> : <><Film className="w-4 h-4" />{scene.videoUrl ? "REGENERATE VIDEO" : "GENERATE VIDEO"}</>}
							</Button>
						</div>
					</div>

					{/* Right side: 16:9 previews */}
					<div className="w-64 flex-shrink-0 space-y-4">
						{/* Image preview */}
						<div className="relative">
							{scene.imageUrl ? (
								<img src={scene.imageUrl} alt={`Scene ${index + 1}`} className="w-full rounded-lg shadow-lg object-cover" style={{ aspectRatio: "16/9" }} />
							) : (
								<div className="w-full bg-muted border border-border rounded-lg flex items-center justify-center text-muted-foreground" style={{ aspectRatio: "16/9" }}>
									<div className="text-center p-4">
										<ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
										<span className="text-xs">16:9 Image</span>
									</div>
								</div>
							)}
							{/* Word overlay during playback */}
							{playingSceneId === scene.id && scene.wordTimestamps && currentWordIndex !== null && (
								<div className="absolute inset-0 flex items-center justify-center rounded-lg">
									<p className="text-foreground text-center text-2xl font-bold px-3 py-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
										{scene.wordTimestamps[currentWordIndex]?.word || ""}
									</p>
								</div>
							)}
						</div>

						{/* Audio info and play */}
						<div className="flex items-center justify-between text-sm">
							<span className="text-muted-foreground">{scene.audioDuration ? `${scene.audioDuration.toFixed(1)}s` : "--"}</span>
							{scene.audioUrl && (
								<button
									type="button"
									onClick={() => onPlayAudio(scene.id)}
									className={`p-2 rounded-full transition-colors ${playingSceneId === scene.id ? "bg-emerald-500 text-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
								>
									<Play className="w-4 h-4" />
								</button>
							)}
						</div>

						{/* Video preview */}
						{scene.videoUrl ? (
							<>
								<video src={scene.videoUrl} controls className="w-full rounded-lg shadow-lg" style={{ aspectRatio: "16/9" }}>
									<track kind="captions" />
								</video>
								<div className="text-xs text-muted-foreground text-center">Video: {scene.videoDuration?.toFixed(1)}s</div>
							</>
						) : (
							<div className="w-full bg-muted border border-border rounded-lg flex items-center justify-center text-muted-foreground" style={{ aspectRatio: "16/9" }}>
								<div className="text-center p-4">
									<Film className="w-8 h-8 mx-auto mb-2 opacity-50" />
									<span className="text-xs">16:9 Video</span>
								</div>
							</div>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
