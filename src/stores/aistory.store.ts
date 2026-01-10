import { Store } from "@tanstack/store";
import type { Scene, WordTimestamp } from "@/hooks/use-aistory-api";

// Image engine options for generation
export type ImageEngine = "gpt-image" | "flux-pro";

// Image style options for prompt + image generation
export type ImageStyle = "cinematic" | "comic" | "low-poly" | "japanese-anime" | "clay";

// Voice options for ElevenLabs narration
export type VoiceId =
	| "PIGsltMj3gFMR34aFDI3" // Jonathan
	| "Z3R5wn05IrDiVCyEkUrK" // Arabella
	| "n1PvBOwxb8X6m7tahp2h"; // Michael

// Video engine options for FAL-AI
export type VideoEngine =
	| "fal-ai/kling-video/v2.6/pro/image-to-video"
	| "fal-ai/kling-video/v2.6/pro/image-to-video:no-audio"
	| "fal-ai/kling-video/o1/reference-to-video"
	| "fal-ai/ltx-2-19b/image-to-video";

// Extended scene state with UI-related fields
export interface SceneState extends Scene {
	imageBase64?: string;
	isLoading?: boolean;
	audioBase64?: string;
	audioDuration?: number;
	isGeneratingAudio?: boolean;
	// Word-level timestamps for synchronized caption display
	wordTimestamps?: WordTimestamp[];
	// Video generation fields
	videoBase64?: string;
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
	characterImage: string | null; // base64
	characterFileId: string | null; // OpenAI file_id for character reference (for GPT Image)
	characterImageUrl: string | null; // FAL storage URL for character reference (for Flux Pro)

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

	// Voice selection
	voiceId: VoiceId;

	// Test mode for faster testing (generates only 2 scenes)
	testMode: boolean;
}

// Initial state
const initialState: AIStoryState = {
	script: "",
	storyId: null,
	sceneDbIds: {},
	characterPrompt: null,
	characterImage: null,
	characterFileId: null,
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
	videoEngine: "fal-ai/kling-video/v2.6/pro/image-to-video",
	imageStyle: "cinematic",
	voiceId: "PIGsltMj3gFMR34aFDI3", // Default: Jonathan
	testMode: false,
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

	setCharacterImage: (characterImage: string | null) => {
		aistoryStore.setState((state) => ({ ...state, characterImage }));
	},

	setCharacterFileId: (characterFileId: string | null) => {
		aistoryStore.setState((state) => ({ ...state, characterFileId }));
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

	setVoiceId: (voiceId: VoiceId) => {
		aistoryStore.setState((state) => ({ ...state, voiceId }));
	},

	setTestMode: (testMode: boolean) => {
		aistoryStore.setState((state) => ({ ...state, testMode }));
	},

	// Reset all state except script
	resetPrompts: () => {
		aistoryStore.setState((state) => ({
			...state,
			storyId: null,
			sceneDbIds: {},
			characterPrompt: null,
			characterImage: null,
			characterFileId: null,
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
