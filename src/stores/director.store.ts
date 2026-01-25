import { Store } from "@tanstack/store";

// ============================================================================
// Engine Types
// ============================================================================

export type DirectorImageEngine =
	| "flux-pro"
	| "gpt-image-1.5"
	| "nano-banana-pro"
	| "nano-banana"
	| "flux-schnell"
	| "flux-schnell-i2i";

export type DirectorVideoEngine =
	| "kling-video"
	| "kling-video-v2.5-turbo"
	| "sora-2"
	| "ltx-2-19b"
	| "wan-pro";

export type DirectorAvatarEngine =
	| "kling-avatar-v2-standard"
	| "kling-avatar-v2-pro"
	| "omnihuman"
	| "aurora";

export type DirectorImageStyle =
	| "cinematic"
	| "comic"
	| "low-poly"
	| "japanese-anime"
	| "clay";

export type DirectorVoiceId =
	| "PIGsltMj3gFMR34aFDI3" // Jonathan
	| "Z3R5wn05IrDiVCyEkUrK" // Arabella
	| "n1PvBOwxb8X6m7tahp2h" // Michael
	| "ZF6FPAbjXT4488VcRRnw" // Amelia
	| "ICwKbPHDHAM3eal5tHEZ" // Tony
	| "cgLpYGyXZhkyalKZ0xeZ" // Knox
	| "YKrm0N1EAM9Bw27j8kuD" // Leonidas
	| string; // Allow custom voice IDs

export type DirectorCaptionLanguage = "en" | "zh-TW";

// ============================================================================
// Media Status Type (matches database enum)
// ============================================================================

export type DirectorMediaStatus = "ready" | "generating" | "completed";

// ============================================================================
// Word Timestamp Type
// ============================================================================

export interface DirectorWordTimestamp {
	word: string;
	startTime: number;
	endTime: number;
}

// ============================================================================
// Character State
// ============================================================================

export interface DirectorCharacterState {
	id: string;
	name: string;
	imagePrompt: string;
	imageUrl: string | null;
	imageId: string | null;
	imageSource: "generate" | "upload"; // Toggle between generation and asset upload
	imageEngine: DirectorImageEngine;
	voiceId: DirectorVoiceId;
	voiceSpeed: number;
	videoEngine: DirectorVideoEngine;
	isGenerating: boolean;
	imageStatus: DirectorMediaStatus | null;
}

// ============================================================================
// Scene State with INDEPENDENT engine settings
// ============================================================================

export interface DirectorSceneState {
	id: string;
	orderIndex: number;
	caption: string; // Narration text
	imagePrompt: string;
	videoPrompt: string;

	// Media references
	imageId: string | null;
	imageUrl: string | null;
	audioId: string | null;
	audioUrl: string | null;
	videoId: string | null;
	videoUrl: string | null;

	// Media status
	imageStatus: DirectorMediaStatus | null;
	audioStatus: DirectorMediaStatus | null;
	videoStatus: DirectorMediaStatus | null;

	// Duration tracking
	audioDuration: number | null;
	videoDuration: number | null;
	wordTimestamps: DirectorWordTimestamp[] | null;

	// Per-scene INDEPENDENT engine settings (key difference from aistory)
	imageEngine: DirectorImageEngine;
	voiceId: DirectorVoiceId;
	voiceSpeed: number;
	videoEngine: DirectorVideoEngine;
	avatarEngine: DirectorAvatarEngine | null; // Optional: use avatar OR regular video
	useAvatar: boolean; // Toggle: true = use avatarEngine, false = use videoEngine
	useCharacterReference: boolean; // Whether to use character image as reference for this scene's image

	// UI state
	isGeneratingImage: boolean;
	isGeneratingAudio: boolean;
	isGeneratingVideo: boolean;
	videoError: string | null;

	// Sound effect fields
	soundEffectPrompt: string | null;
	soundEffectId: string | null;
	soundEffectUrl: string | null;
	soundEffectDuration: number | null;
	soundEffectOffset: number; // seconds - where sound effect starts in video
	soundEffectStatus: DirectorMediaStatus | null;
	isGeneratingSoundEffect: boolean;
	isMergingSoundEffect: boolean;
}

// ============================================================================
// Error State
// ============================================================================

export interface DirectorErrorState {
	message: string;
	code?: string;
	timestamp: number;
	retryCount: number;
	retryable?: boolean;
	operation?: "story" | "character" | "image" | "audio" | "video" | "export";
	resourceId?: string;
}

// ============================================================================
// Main Store State
// ============================================================================

export interface DirectorState {
	storyId: string | null;
	title: string;

	// Default engines (used when creating new scenes)
	defaultImageEngine: DirectorImageEngine;
	defaultImageStyle: DirectorImageStyle;
	defaultVideoEngine: DirectorVideoEngine;
	defaultAvatarEngine: DirectorAvatarEngine;
	defaultVoiceId: DirectorVoiceId;
	defaultVoiceSpeed: number;
	captionLanguage: DirectorCaptionLanguage;

	// Character (single character for now)
	character: DirectorCharacterState | null;

	// Scenes
	scenes: DirectorSceneState[];

	// UI state
	promptsGenerated: boolean;
	isGeneratingPrompts: boolean;
	error: DirectorErrorState | null;
	sceneError: DirectorErrorState | null;

	// Audio playback
	playingSceneId: string | null;

	// Export
	isExportingVideo: boolean;
	exportedVideoUrl: string | null;
	exportError: DirectorErrorState | null;

	// Batch generation
	isGeneratingAllImages: boolean;
	isGeneratingAllAudios: boolean;
	isGeneratingAllVideos: boolean;
	batchProgress: { current: number; total: number; type: string } | null;
	batchCancelled: boolean;

	// Pending regenerate queue (for requests made during batch generation)
	pendingRegenerateQueue: Array<{
		sceneId: string;
		type: "image" | "audio" | "video";
	}>;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: DirectorState = {
	storyId: null,
	title: "",

	defaultImageEngine: "flux-pro",
	defaultImageStyle: "cinematic",
	defaultVideoEngine: "sora-2",
	defaultAvatarEngine: "kling-avatar-v2-standard",
	defaultVoiceId: "PIGsltMj3gFMR34aFDI3", // Jonathan
	defaultVoiceSpeed: 1.0,
	captionLanguage: "en",

	character: null,
	scenes: [],

	promptsGenerated: false,
	isGeneratingPrompts: false,
	error: null,
	sceneError: null,

	playingSceneId: null,

	isExportingVideo: false,
	exportedVideoUrl: null,
	exportError: null,

	isGeneratingAllImages: false,
	isGeneratingAllAudios: false,
	isGeneratingAllVideos: false,
	batchProgress: null,
	batchCancelled: false,
	pendingRegenerateQueue: [],
};

// ============================================================================
// Store Instance
// ============================================================================

export const directorStore = new Store<DirectorState>(initialState);

// ============================================================================
// Helper Functions
// ============================================================================

function createErrorState(
	message: string,
	options: Partial<Omit<DirectorErrorState, "message" | "timestamp">> = {},
): DirectorErrorState {
	return {
		message,
		timestamp: Date.now(),
		retryCount: 0,
		retryable: true,
		...options,
	};
}

function createNewScene(state: DirectorState): DirectorSceneState {
	return {
		id: `scene-new-${Date.now()}`,
		orderIndex: state.scenes.length,
		caption: "",
		imagePrompt: "",
		videoPrompt: "",
		imageId: null,
		imageUrl: null,
		audioId: null,
		audioUrl: null,
		videoId: null,
		videoUrl: null,
		imageStatus: null,
		audioStatus: null,
		videoStatus: null,
		audioDuration: null,
		videoDuration: null,
		wordTimestamps: null,
		// Inherit from defaults
		imageEngine: state.defaultImageEngine,
		voiceId: state.defaultVoiceId,
		voiceSpeed: state.defaultVoiceSpeed,
		videoEngine: state.defaultVideoEngine,
		avatarEngine: state.defaultAvatarEngine,
		useAvatar: false,
		useCharacterReference: true, // Default to using character reference for consistency
		isGeneratingImage: false,
		isGeneratingAudio: false,
		isGeneratingVideo: false,
		videoError: null,
		// Sound effect fields
		soundEffectPrompt: null,
		soundEffectId: null,
		soundEffectUrl: null,
		soundEffectDuration: null,
		soundEffectOffset: 0,
		soundEffectStatus: null,
		isGeneratingSoundEffect: false,
		isMergingSoundEffect: false,
	};
}

// ============================================================================
// Actions
// ============================================================================

export const directorActions = {
	// ========================================================================
	// Basic Setters
	// ========================================================================

	setStoryId: (storyId: string | null) =>
		directorStore.setState((s) => ({ ...s, storyId })),

	setTitle: (title: string) =>
		directorStore.setState((s) => ({ ...s, title })),

	// ========================================================================
	// Default Engine Setters
	// ========================================================================

	setDefaultImageEngine: (engine: DirectorImageEngine) =>
		directorStore.setState((s) => ({ ...s, defaultImageEngine: engine })),

	setDefaultVideoEngine: (engine: DirectorVideoEngine) =>
		directorStore.setState((s) => ({ ...s, defaultVideoEngine: engine })),

	setDefaultAvatarEngine: (engine: DirectorAvatarEngine) =>
		directorStore.setState((s) => ({ ...s, defaultAvatarEngine: engine })),

	setDefaultVoiceId: (voiceId: DirectorVoiceId) =>
		directorStore.setState((s) => ({ ...s, defaultVoiceId: voiceId })),

	setDefaultVoiceSpeed: (speed: number) =>
		directorStore.setState((s) => ({ ...s, defaultVoiceSpeed: speed })),

	setDefaultImageStyle: (style: DirectorImageStyle) =>
		directorStore.setState((s) => ({ ...s, defaultImageStyle: style })),

	setCaptionLanguage: (language: DirectorCaptionLanguage) =>
		directorStore.setState((s) => ({ ...s, captionLanguage: language })),

	// ========================================================================
	// Character Actions
	// ========================================================================

	setCharacter: (character: DirectorCharacterState | null) =>
		directorStore.setState((s) => ({ ...s, character })),

	updateCharacter: (updates: Partial<DirectorCharacterState>) =>
		directorStore.setState((s) => ({
			...s,
			character: s.character ? { ...s.character, ...updates } : null,
		})),

	clearCharacter: () =>
		directorStore.setState((s) => ({ ...s, character: null })),

	// ========================================================================
	// Scene Actions
	// ========================================================================

	setScenes: (scenes: DirectorSceneState[]) =>
		directorStore.setState((s) => ({ ...s, scenes })),

	addScene: (afterSceneId?: string) => {
		directorStore.setState((s) => {
			const newScene = createNewScene(s);

			if (!afterSceneId) {
				return { ...s, scenes: [...s.scenes, newScene] };
			}

			const index = s.scenes.findIndex((sc) => sc.id === afterSceneId);
			if (index === -1) {
				return { ...s, scenes: [...s.scenes, newScene] };
			}

			const newScenes = [...s.scenes];
			newScenes.splice(index + 1, 0, newScene);
			// Update orderIndex for all scenes
			return {
				...s,
				scenes: newScenes.map((sc, i) => ({ ...sc, orderIndex: i })),
			};
		});
	},

	// Add a scene with specific ID and data (for AI assistant tool results)
	addSceneWithData: (
		sceneId: string,
		orderIndex: number,
		data: { caption?: string; imagePrompt?: string; videoPrompt?: string; soundEffectPrompt?: string },
	) => {
		directorStore.setState((s) => {
			const newScene: DirectorSceneState = {
				id: sceneId,
				orderIndex,
				caption: data.caption || "",
				imagePrompt: data.imagePrompt || "",
				videoPrompt: data.videoPrompt || "",
				imageId: null,
				imageUrl: null,
				audioId: null,
				audioUrl: null,
				videoId: null,
				videoUrl: null,
				imageStatus: null,
				audioStatus: null,
				videoStatus: null,
				audioDuration: null,
				videoDuration: null,
				wordTimestamps: null,
				imageEngine: s.defaultImageEngine,
				voiceId: s.defaultVoiceId,
				voiceSpeed: s.defaultVoiceSpeed,
				videoEngine: s.defaultVideoEngine,
				avatarEngine: s.defaultAvatarEngine,
				useAvatar: false,
				useCharacterReference: true,
				isGeneratingImage: false,
				isGeneratingAudio: false,
				isGeneratingVideo: false,
				videoError: null,
				// Sound effect fields
				soundEffectPrompt: data.soundEffectPrompt || null,
				soundEffectId: null,
				soundEffectUrl: null,
				soundEffectDuration: null,
				soundEffectOffset: 0,
				soundEffectStatus: null,
				isGeneratingSoundEffect: false,
				isMergingSoundEffect: false,
			};

			// Insert at the correct position based on orderIndex
			const newScenes = [...s.scenes];
			newScenes.splice(orderIndex, 0, newScene);
			// Re-index all scenes
			return {
				...s,
				scenes: newScenes.map((sc, i) => ({ ...sc, orderIndex: i })),
			};
		});
	},

	updateScene: (sceneId: string, updates: Partial<DirectorSceneState>) =>
		directorStore.setState((s) => ({
			...s,
			scenes: s.scenes.map((sc) =>
				sc.id === sceneId ? { ...sc, ...updates } : sc,
			),
		})),

	deleteScene: (sceneId: string) =>
		directorStore.setState((s) => {
			const newScenes = s.scenes
				.filter((sc) => sc.id !== sceneId)
				.map((sc, i) => ({ ...sc, orderIndex: i }));
			return { ...s, scenes: newScenes };
		}),

	reorderScenes: (fromIndex: number, toIndex: number) =>
		directorStore.setState((s) => {
			const newScenes = [...s.scenes];
			const [moved] = newScenes.splice(fromIndex, 1);
			newScenes.splice(toIndex, 0, moved);
			// Update orderIndex for all scenes
			return {
				...s,
				scenes: newScenes.map((sc, i) => ({ ...sc, orderIndex: i })),
			};
		}),

	// ========================================================================
	// Per-Scene Engine Updates
	// ========================================================================

	updateSceneImageEngine: (sceneId: string, engine: DirectorImageEngine) =>
		directorStore.setState((s) => ({
			...s,
			scenes: s.scenes.map((sc) =>
				sc.id === sceneId ? { ...sc, imageEngine: engine } : sc,
			),
		})),

	updateSceneVideoEngine: (sceneId: string, engine: DirectorVideoEngine) =>
		directorStore.setState((s) => ({
			...s,
			scenes: s.scenes.map((sc) =>
				sc.id === sceneId ? { ...sc, videoEngine: engine } : sc,
			),
		})),

	updateSceneAvatarEngine: (
		sceneId: string,
		engine: DirectorAvatarEngine | null,
	) =>
		directorStore.setState((s) => ({
			...s,
			scenes: s.scenes.map((sc) =>
				sc.id === sceneId ? { ...sc, avatarEngine: engine } : sc,
			),
		})),

	updateSceneVoice: (sceneId: string, voiceId: DirectorVoiceId) =>
		directorStore.setState((s) => ({
			...s,
			scenes: s.scenes.map((sc) =>
				sc.id === sceneId ? { ...sc, voiceId } : sc,
			),
		})),

	updateSceneVoiceSpeed: (sceneId: string, voiceSpeed: number) =>
		directorStore.setState((s) => ({
			...s,
			scenes: s.scenes.map((sc) =>
				sc.id === sceneId ? { ...sc, voiceSpeed } : sc,
			),
		})),

	toggleSceneAvatarMode: (sceneId: string, useAvatar: boolean) =>
		directorStore.setState((s) => ({
			...s,
			scenes: s.scenes.map((sc) =>
				sc.id === sceneId ? { ...sc, useAvatar } : sc,
			),
		})),

	toggleSceneCharacterReference: (sceneId: string, useCharacterReference: boolean) =>
		directorStore.setState((s) => ({
			...s,
			scenes: s.scenes.map((sc) =>
				sc.id === sceneId ? { ...sc, useCharacterReference } : sc,
			),
		})),

	// ========================================================================
	// Apply Defaults to All Scenes
	// ========================================================================

	applyDefaultsToAllScenes: () =>
		directorStore.setState((s) => ({
			...s,
			scenes: s.scenes.map((sc) => ({
				...sc,
				imageEngine: s.defaultImageEngine,
				voiceId: s.defaultVoiceId,
				voiceSpeed: s.defaultVoiceSpeed,
				videoEngine: s.defaultVideoEngine,
				avatarEngine: s.defaultAvatarEngine,
			})),
		})),

	// ========================================================================
	// State Flags
	// ========================================================================

	setPromptsGenerated: (val: boolean) =>
		directorStore.setState((s) => ({ ...s, promptsGenerated: val })),

	setIsGeneratingPrompts: (val: boolean) =>
		directorStore.setState((s) => ({ ...s, isGeneratingPrompts: val })),

	setPlayingSceneId: (playingSceneId: string | null) =>
		directorStore.setState((s) => ({ ...s, playingSceneId })),

	// ========================================================================
	// Error Handling
	// ========================================================================

	setError: (
		error: string | DirectorErrorState | null,
		options?: Partial<Omit<DirectorErrorState, "message" | "timestamp">>,
	) => {
		directorStore.setState((s) => ({
			...s,
			error:
				error === null
					? null
					: typeof error === "string"
						? createErrorState(error, options)
						: error,
		}));
	},

	setSceneError: (
		error: string | DirectorErrorState | null,
		options?: Partial<Omit<DirectorErrorState, "message" | "timestamp">>,
	) => {
		directorStore.setState((s) => ({
			...s,
			sceneError:
				error === null
					? null
					: typeof error === "string"
						? createErrorState(error, options)
						: error,
		}));
	},

	// ========================================================================
	// Export
	// ========================================================================

	setIsExportingVideo: (val: boolean) =>
		directorStore.setState((s) => ({ ...s, isExportingVideo: val })),

	setExportedVideoUrl: (url: string | null) =>
		directorStore.setState((s) => ({ ...s, exportedVideoUrl: url })),

	setExportError: (
		error: string | DirectorErrorState | null,
		options?: Partial<Omit<DirectorErrorState, "message" | "timestamp">>,
	) => {
		directorStore.setState((s) => ({
			...s,
			exportError:
				error === null
					? null
					: typeof error === "string"
						? createErrorState(error, { operation: "export", ...options })
						: error,
		}));
	},

	// ========================================================================
	// Batch Generation
	// ========================================================================

	setIsGeneratingAllImages: (val: boolean) =>
		directorStore.setState((s) => ({ ...s, isGeneratingAllImages: val })),

	setIsGeneratingAllAudios: (val: boolean) =>
		directorStore.setState((s) => ({ ...s, isGeneratingAllAudios: val })),

	setIsGeneratingAllVideos: (val: boolean) =>
		directorStore.setState((s) => ({ ...s, isGeneratingAllVideos: val })),

	setBatchProgress: (
		progress: { current: number; total: number; type: string } | null,
	) => directorStore.setState((s) => ({ ...s, batchProgress: progress })),

	setBatchCancelled: (val: boolean) =>
		directorStore.setState((s) => ({ ...s, batchCancelled: val })),

	cancelBatchGeneration: () =>
		directorStore.setState((s) => ({ ...s, batchCancelled: true })),

	// Pending regenerate queue actions
	addToPendingQueue: (sceneId: string, type: "image" | "audio" | "video") =>
		directorStore.setState((s) => ({
			...s,
			pendingRegenerateQueue: [
				...s.pendingRegenerateQueue.filter(
					(item) => !(item.sceneId === sceneId && item.type === type),
				),
				{ sceneId, type },
			],
		})),

	removeFromPendingQueue: (sceneId: string, type: "image" | "audio" | "video") =>
		directorStore.setState((s) => ({
			...s,
			pendingRegenerateQueue: s.pendingRegenerateQueue.filter(
				(item) => !(item.sceneId === sceneId && item.type === type),
			),
		})),

	clearPendingQueue: () =>
		directorStore.setState((s) => ({ ...s, pendingRegenerateQueue: [] })),

	getPendingQueueByType: (type: "image" | "audio" | "video") =>
		directorStore.state.pendingRegenerateQueue.filter((item) => item.type === type),

	// ========================================================================
	// Sound Effect Actions
	// ========================================================================

	setSoundEffectPrompt: (sceneId: string, prompt: string | null) =>
		directorStore.setState((s) => ({
			...s,
			scenes: s.scenes.map((sc) =>
				sc.id === sceneId ? { ...sc, soundEffectPrompt: prompt } : sc,
			),
		})),

	setSoundEffectOffset: (sceneId: string, offset: number) =>
		directorStore.setState((s) => ({
			...s,
			scenes: s.scenes.map((sc) =>
				sc.id === sceneId ? { ...sc, soundEffectOffset: offset } : sc,
			),
		})),

	updateSoundEffectStatus: (
		sceneId: string,
		status: DirectorMediaStatus | null,
		url?: string | null,
		duration?: number | null,
		soundEffectId?: string | null,
	) =>
		directorStore.setState((s) => ({
			...s,
			scenes: s.scenes.map((sc) =>
				sc.id === sceneId
					? {
							...sc,
							soundEffectStatus: status,
							...(url !== undefined && { soundEffectUrl: url }),
							...(duration !== undefined && { soundEffectDuration: duration }),
							...(soundEffectId !== undefined && { soundEffectId }),
						}
					: sc,
			),
		})),

	setIsGeneratingSoundEffect: (sceneId: string, isGenerating: boolean) =>
		directorStore.setState((s) => ({
			...s,
			scenes: s.scenes.map((sc) =>
				sc.id === sceneId ? { ...sc, isGeneratingSoundEffect: isGenerating } : sc,
			),
		})),

	setIsMergingSoundEffect: (sceneId: string, isMerging: boolean) =>
		directorStore.setState((s) => ({
			...s,
			scenes: s.scenes.map((sc) =>
				sc.id === sceneId ? { ...sc, isMergingSoundEffect: isMerging } : sc,
			),
		})),

	// ========================================================================
	// Reset
	// ========================================================================

	reset: () => directorStore.setState(() => initialState),

	resetPrompts: () =>
		directorStore.setState((s) => ({
			...s,
			storyId: null,
			character: null,
			scenes: [],
			promptsGenerated: false,
			error: null,
			sceneError: null,
			isExportingVideo: false,
			exportedVideoUrl: null,
			exportError: null,
			isGeneratingAllImages: false,
			isGeneratingAllAudios: false,
			isGeneratingAllVideos: false,
			batchProgress: null,
			batchCancelled: false,
			pendingRegenerateQueue: [],
		})),
};
