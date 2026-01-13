import { Store } from "@tanstack/store";
import type { WordTimestamp } from "@/hooks/use-aistory-api";
import type { VoiceId, ImageEngine, ImageStyle } from "./aistory.store";

// Speaker type for podcast42
export type Podcast42Speaker = "person1" | "person2";

// Video engine type for podcast42
export type Podcast42VideoEngine = "omnihuman" | "aurora";

// Scene interface for podcast42
export interface Podcast42Scene {
	id: string;
	speaker: Podcast42Speaker;
	caption: string;
	audioBase64?: string;
	audioDuration?: number;
	wordTimestamps?: WordTimestamp[];
	videoBase64?: string;
	videoDuration?: number;
	isGeneratingAudio?: boolean;
	isGeneratingVideo?: boolean;
	videoError?: string | null;
}

// Podcast42 store state interface
export interface Podcast42State {
	// Script input
	playScript: string;

	// Database persistence state
	storyId: string | null;
	sceneDbIds: Record<string, string>; // clientId -> dbId mapping

	// Person1 character data
	person1Prompt: string | null;
	person1Image: string | null; // base64
	person1ImageUrl: string | null; // FAL storage URL
	isGeneratingPerson1: boolean;

	// Person2 character data
	person2Prompt: string | null;
	person2Image: string | null; // base64
	person2ImageUrl: string | null; // FAL storage URL
	isGeneratingPerson2: boolean;

	// Scenes data
	scenes: Podcast42Scene[];

	// Prompt generation state
	isGeneratingPrompts: boolean;
	promptsGenerated: boolean;

	// Error state
	error: string | null;
	sceneError: string | null;

	// Export video state
	isExportingVideo: boolean;
	exportedVideoUrl: string | null;
	exportError: string | null;

	// Engine selections
	imageEngine: ImageEngine;
	imageStyle: ImageStyle;
	videoEngine: Podcast42VideoEngine;

	// Voice selections for each person
	person1VoiceId: VoiceId;
	person2VoiceId: VoiceId;

	// Test mode for faster testing (generates only 2 scenes)
	testMode: boolean;
}

// Initial state
const initialState: Podcast42State = {
	playScript: "",
	storyId: null,
	sceneDbIds: {},
	person1Prompt: null,
	person1Image: null,
	person1ImageUrl: null,
	isGeneratingPerson1: false,
	person2Prompt: null,
	person2Image: null,
	person2ImageUrl: null,
	isGeneratingPerson2: false,
	scenes: [],
	isGeneratingPrompts: false,
	promptsGenerated: false,
	error: null,
	sceneError: null,
	isExportingVideo: false,
	exportedVideoUrl: null,
	exportError: null,
	imageEngine: "flux-pro",
	imageStyle: "cinematic",
	videoEngine: "omnihuman",
	person1VoiceId: "PIGsltMj3gFMR34aFDI3", // Default: Jonathan
	person2VoiceId: "Z3R5wn05IrDiVCyEkUrK", // Default: Arabella
	testMode: false,
};

// Create the store
export const podcast42Store = new Store<Podcast42State>(initialState);

// Action helpers
export const podcast42Actions = {
	setPlayScript: (playScript: string) => {
		podcast42Store.setState((state) => ({ ...state, playScript }));
	},

	// Database persistence actions
	setStoryId: (storyId: string | null) => {
		podcast42Store.setState((state) => ({ ...state, storyId }));
	},

	setSceneDbIds: (sceneDbIds: Record<string, string>) => {
		podcast42Store.setState((state) => ({ ...state, sceneDbIds }));
	},

	// Get database scene ID from client scene ID
	getSceneDbId: (clientId: string): string | undefined => {
		return podcast42Store.state.sceneDbIds[clientId];
	},

	// Person1 actions
	setPerson1Prompt: (person1Prompt: string | null) => {
		podcast42Store.setState((state) => ({ ...state, person1Prompt }));
	},

	setPerson1Image: (person1Image: string | null) => {
		podcast42Store.setState((state) => ({ ...state, person1Image }));
	},

	setPerson1ImageUrl: (person1ImageUrl: string | null) => {
		podcast42Store.setState((state) => ({ ...state, person1ImageUrl }));
	},

	setIsGeneratingPerson1: (isGeneratingPerson1: boolean) => {
		podcast42Store.setState((state) => ({ ...state, isGeneratingPerson1 }));
	},

	// Person2 actions
	setPerson2Prompt: (person2Prompt: string | null) => {
		podcast42Store.setState((state) => ({ ...state, person2Prompt }));
	},

	setPerson2Image: (person2Image: string | null) => {
		podcast42Store.setState((state) => ({ ...state, person2Image }));
	},

	setPerson2ImageUrl: (person2ImageUrl: string | null) => {
		podcast42Store.setState((state) => ({ ...state, person2ImageUrl }));
	},

	setIsGeneratingPerson2: (isGeneratingPerson2: boolean) => {
		podcast42Store.setState((state) => ({ ...state, isGeneratingPerson2 }));
	},

	// Scene actions
	setScenes: (scenes: Podcast42Scene[]) => {
		podcast42Store.setState((state) => ({ ...state, scenes }));
	},

	updateScene: (sceneId: string, updates: Partial<Podcast42Scene>) => {
		podcast42Store.setState((state) => ({
			...state,
			scenes: state.scenes.map((scene) =>
				scene.id === sceneId ? { ...scene, ...updates } : scene,
			),
		}));
	},

	// Add a new scene after the specified scene (or at the end if no sceneId provided)
	addScene: (afterSceneId?: string) => {
		podcast42Store.setState((state) => {
			const newScene: Podcast42Scene = {
				id: `scene-new-${Date.now()}`,
				speaker: "person1",
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
		podcast42Store.setState((state) => ({
			...state,
			scenes: state.scenes.filter((s) => s.id !== sceneId),
		}));
	},

	// Reorder scenes by moving from one index to another
	reorderScenes: (fromIndex: number, toIndex: number) => {
		podcast42Store.setState((state) => {
			const newScenes = [...state.scenes];
			const [moved] = newScenes.splice(fromIndex, 1);
			newScenes.splice(toIndex, 0, moved);
			return { ...state, scenes: newScenes };
		});
	},

	setIsGeneratingPrompts: (isGeneratingPrompts: boolean) => {
		podcast42Store.setState((state) => ({ ...state, isGeneratingPrompts }));
	},

	setPromptsGenerated: (promptsGenerated: boolean) => {
		podcast42Store.setState((state) => ({ ...state, promptsGenerated }));
	},

	setError: (error: string | null) => {
		podcast42Store.setState((state) => ({ ...state, error }));
	},

	setSceneError: (sceneError: string | null) => {
		podcast42Store.setState((state) => ({ ...state, sceneError }));
	},

	// Export video actions
	setIsExportingVideo: (isExportingVideo: boolean) => {
		podcast42Store.setState((state) => ({ ...state, isExportingVideo }));
	},

	setExportedVideoUrl: (exportedVideoUrl: string | null) => {
		podcast42Store.setState((state) => ({ ...state, exportedVideoUrl }));
	},

	setExportError: (exportError: string | null) => {
		podcast42Store.setState((state) => ({ ...state, exportError }));
	},

	// Engine selections
	setImageEngine: (imageEngine: ImageEngine) => {
		podcast42Store.setState((state) => ({ ...state, imageEngine }));
	},

	setImageStyle: (imageStyle: ImageStyle) => {
		podcast42Store.setState((state) => ({ ...state, imageStyle }));
	},

	setVideoEngine: (videoEngine: Podcast42VideoEngine) => {
		podcast42Store.setState((state) => ({ ...state, videoEngine }));
	},

	setPerson1VoiceId: (person1VoiceId: VoiceId) => {
		podcast42Store.setState((state) => ({ ...state, person1VoiceId }));
	},

	setPerson2VoiceId: (person2VoiceId: VoiceId) => {
		podcast42Store.setState((state) => ({ ...state, person2VoiceId }));
	},

	setTestMode: (testMode: boolean) => {
		podcast42Store.setState((state) => ({ ...state, testMode }));
	},

	// Reset all state except playScript
	resetPrompts: () => {
		podcast42Store.setState((state) => ({
			...state,
			storyId: null,
			sceneDbIds: {},
			person1Prompt: null,
			person1Image: null,
			person1ImageUrl: null,
			person2Prompt: null,
			person2Image: null,
			person2ImageUrl: null,
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
		podcast42Store.setState(() => initialState);
	},
};
