import { Store } from "@tanstack/store";
import type { Scene, WordTimestamp } from "@/hooks/use-aistory-api";

// Image engine options for generation (all via FAL AI)
export type ImageEngine = "flux-pro" | "gpt-image-1.5";

// Image style options for prompt + image generation
export type ImageStyle =
	| "cinematic"
	| "comic"
	| "low-poly"
	| "japanese-anime"
	| "clay";

// Voice options for ElevenLabs narration
export type VoiceId =
	| "PIGsltMj3gFMR34aFDI3" // Jonathan
	| "Z3R5wn05IrDiVCyEkUrK" // Arabella
	| "n1PvBOwxb8X6m7tahp2h" // Michael
	| "ZF6FPAbjXT4488VcRRnw" // Amelia
	| "ICwKbPHDHAM3eal5tHEZ" // Tony
	| "cgLpYGyXZhkyalKZ0xeZ" // Knox
	| "YKrm0N1EAM9Bw27j8kuD"; // Leonidas

// Video engine options for FAL-AI
export type VideoEngine =
	| "kling-video"
	| "sora-2"
	| "ltx-2-19b"
	| "veo3.1"
	| "veo3.1-fast";

// LLM engine options for prompt generation
export type LLMEngine = "gpt-4.1" | "claude-opus-4-5";

// Media status type (matches database enum)
export type MediaStatus = "ready" | "generating" | "completed";

// Extended scene state with UI-related fields
export interface SceneState extends Scene {
	// Database media IDs
	imageId?: string;
	audioId?: string;
	videoId?: string;
	// Supabase Storage URLs
	imageUrl?: string;
	audioUrl?: string;
	videoUrl?: string;
	// Database media status (for resuming generation monitoring)
	imageStatus?: MediaStatus;
	audioStatus?: MediaStatus;
	videoStatus?: MediaStatus;
	// Per-scene voice settings
	voiceId?: VoiceId;
	voiceSpeed?: number;
	// UI state
	isLoading?: boolean;
	audioDuration?: number;
	isGeneratingAudio?: boolean;
	// Word-level timestamps for synchronized caption display
	wordTimestamps?: WordTimestamp[];
	// Video generation fields
	videoDuration?: number;
	isGeneratingVideo?: boolean;
	videoError?: string | null;
}

// AI Story store state interface
export interface AIStoryState {
	// Script input
	script: string;

	// Database persistence state
	storyId: string | null; // Database story ID (set after prompts generated)
	sceneDbIds: Record<string, string>; // clientId -> dbId mapping

	// Character data
	characterPrompt: string | null;
	characterImageId: string | null; // Database image ID
	characterImageUrl: string | null; // Supabase Storage URL (used by all FAL engines)

	// Character generation state
	isGeneratingCharacter: boolean;

	// Scenes data
	scenes: SceneState[];

	// Prompt generation state
	isGeneratingPrompts: boolean;
	promptsGenerated: boolean;

	// Audio playback
	playingSceneId: string | null;

	// Error state
	error: string | null;
	sceneError: string | null;

	// Export video state
	isExportingVideo: boolean;
	exportedVideoUrl: string | null;
	exportError: string | null;

	// Engine selections
	imageEngine: ImageEngine;
	videoEngine: VideoEngine;
	imageStyle: ImageStyle;
	llmEngine: LLMEngine;
}

// Initial state
const initialState: AIStoryState = {
	script: "",
	storyId: null,
	sceneDbIds: {},
	characterPrompt: null,
	characterImageId: null,
	characterImageUrl: null,
	isGeneratingCharacter: false,
	scenes: [],
	isGeneratingPrompts: false,
	promptsGenerated: false,
	playingSceneId: null,
	error: null,
	sceneError: null,
	isExportingVideo: false,
	exportedVideoUrl: null,
	exportError: null,
	imageEngine: "flux-pro",
	videoEngine: "kling-video",
	imageStyle: "cinematic",
	llmEngine: "gpt-4.1",
};

// Create the store
export const aistoryStore = new Store<AIStoryState>(initialState);

// Action helpers
export const aistoryActions = {
	setScript: (script: string) => {
		aistoryStore.setState((state) => ({ ...state, script }));
	},

	// Database persistence actions
	setStoryId: (storyId: string | null) => {
		aistoryStore.setState((state) => ({ ...state, storyId }));
	},

	setSceneDbIds: (sceneDbIds: Record<string, string>) => {
		aistoryStore.setState((state) => ({ ...state, sceneDbIds }));
	},

	// Get database scene ID from client scene ID
	getSceneDbId: (clientId: string): string | undefined => {
		return aistoryStore.state.sceneDbIds[clientId];
	},

	setCharacterPrompt: (characterPrompt: string) => {
		aistoryStore.setState((state) => ({ ...state, characterPrompt }));
	},

	setCharacterImageId: (characterImageId: string | null) => {
		aistoryStore.setState((state) => ({ ...state, characterImageId }));
	},

	setCharacterImageUrl: (characterImageUrl: string | null) => {
		aistoryStore.setState((state) => ({ ...state, characterImageUrl }));
	},

	setIsGeneratingCharacter: (isGeneratingCharacter: boolean) => {
		aistoryStore.setState((state) => ({ ...state, isGeneratingCharacter }));
	},

	setScenes: (scenes: SceneState[]) => {
		aistoryStore.setState((state) => ({ ...state, scenes }));
	},

	updateScene: (sceneId: string, updates: Partial<SceneState>) => {
		aistoryStore.setState((state) => ({
			...state,
			scenes: state.scenes.map((scene) =>
				scene.id === sceneId ? { ...scene, ...updates } : scene,
			),
		}));
	},

	// Add a new scene after the specified scene (or at the end if no sceneId provided)
	addScene: (afterSceneId?: string) => {
		aistoryStore.setState((state) => {
			const newScene: SceneState = {
				id: `scene-new-${Date.now()}`,
				title: "New Scene",
				prompt: "",
				video_prompt: "",
				isCharacter: true,
				caption: "",
			};
			if (!afterSceneId) {
				return { ...state, scenes: [...state.scenes, newScene] };
			}
			const index = state.scenes.findIndex((s) => s.id === afterSceneId);
			const newScenes = [...state.scenes];
			newScenes.splice(index + 1, 0, newScene);
			return { ...state, scenes: newScenes };
		});
	},

	// Delete a scene by ID
	deleteScene: (sceneId: string) => {
		aistoryStore.setState((state) => ({
			...state,
			scenes: state.scenes.filter((s) => s.id !== sceneId),
		}));
	},

	// Reorder scenes by moving from one index to another
	reorderScenes: (fromIndex: number, toIndex: number) => {
		aistoryStore.setState((state) => {
			const newScenes = [...state.scenes];
			const [moved] = newScenes.splice(fromIndex, 1);
			newScenes.splice(toIndex, 0, moved);
			return { ...state, scenes: newScenes };
		});
	},

	setIsGeneratingPrompts: (isGeneratingPrompts: boolean) => {
		aistoryStore.setState((state) => ({ ...state, isGeneratingPrompts }));
	},

	setPromptsGenerated: (promptsGenerated: boolean) => {
		aistoryStore.setState((state) => ({ ...state, promptsGenerated }));
	},

	setPlayingSceneId: (playingSceneId: string | null) => {
		aistoryStore.setState((state) => ({ ...state, playingSceneId }));
	},

	setError: (error: string | null) => {
		aistoryStore.setState((state) => ({ ...state, error }));
	},

	setSceneError: (sceneError: string | null) => {
		aistoryStore.setState((state) => ({ ...state, sceneError }));
	},

	// Export video actions
	setIsExportingVideo: (isExportingVideo: boolean) => {
		aistoryStore.setState((state) => ({ ...state, isExportingVideo }));
	},

	setExportedVideoUrl: (exportedVideoUrl: string | null) => {
		aistoryStore.setState((state) => ({ ...state, exportedVideoUrl }));
	},

	setExportError: (exportError: string | null) => {
		aistoryStore.setState((state) => ({ ...state, exportError }));
	},

	// Engine selections
	setImageEngine: (imageEngine: ImageEngine) => {
		aistoryStore.setState((state) => ({ ...state, imageEngine }));
	},

	setVideoEngine: (videoEngine: VideoEngine) => {
		aistoryStore.setState((state) => ({ ...state, videoEngine }));
	},

	setImageStyle: (imageStyle: ImageStyle) => {
		aistoryStore.setState((state) => ({ ...state, imageStyle }));
	},

	setLLMEngine: (llmEngine: LLMEngine) => {
		aistoryStore.setState((state) => ({ ...state, llmEngine }));
	},

	// Reset all state except script
	resetPrompts: () => {
		aistoryStore.setState((state) => ({
			...state,
			storyId: null,
			sceneDbIds: {},
			characterPrompt: null,
			characterImageId: null,
			characterImageUrl: null,
			scenes: [],
			promptsGenerated: false,
			error: null,
			sceneError: null,
			isExportingVideo: false,
			exportedVideoUrl: null,
			exportError: null,
		}));
	},

	// Full reset
	reset: () => {
		aistoryStore.setState(() => initialState);
	},
};
