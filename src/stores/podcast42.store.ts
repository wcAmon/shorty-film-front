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
	// Database media IDs
	audioId?: string;
	videoId?: string;
	// Supabase Storage URLs
	audioUrl?: string;
	videoUrl?: string;
	// Media metadata
	audioDuration?: number;
	wordTimestamps?: WordTimestamp[];
	videoDuration?: number;
	// UI state
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
	person1ImageId: string | null; // Database image ID
	person1ImageUrl: string | null; // Supabase Storage URL
	person1FalImageUrl: string | null; // FAL storage URL for video generation
	isGeneratingPerson1: boolean;

	// Person2 character data
	person2Prompt: string | null;
	person2ImageId: string | null; // Database image ID
	person2ImageUrl: string | null; // Supabase Storage URL
	person2FalImageUrl: string | null; // FAL storage URL for video generation
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

	// Video generation queue
	videoQueue: string[]; // Scene IDs waiting to be processed
	currentProcessingSceneId: string | null; // Currently processing scene ID
}

// Initial state
const initialState: Podcast42State = {
	playScript: "",
	storyId: null,
	sceneDbIds: {},
	person1Prompt: null,
	person1ImageId: null,
	person1ImageUrl: null,
	person1FalImageUrl: null,
	isGeneratingPerson1: false,
	person2Prompt: null,
	person2ImageId: null,
	person2ImageUrl: null,
	person2FalImageUrl: null,
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
	videoQueue: [],
	currentProcessingSceneId: null,
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

	setPerson1ImageId: (person1ImageId: string | null) => {
		podcast42Store.setState((state) => ({ ...state, person1ImageId }));
	},

	setPerson1ImageUrl: (person1ImageUrl: string | null) => {
		podcast42Store.setState((state) => ({ ...state, person1ImageUrl }));
	},

	setPerson1FalImageUrl: (person1FalImageUrl: string | null) => {
		podcast42Store.setState((state) => ({ ...state, person1FalImageUrl }));
	},

	setIsGeneratingPerson1: (isGeneratingPerson1: boolean) => {
		podcast42Store.setState((state) => ({ ...state, isGeneratingPerson1 }));
	},

	// Person2 actions
	setPerson2Prompt: (person2Prompt: string | null) => {
		podcast42Store.setState((state) => ({ ...state, person2Prompt }));
	},

	setPerson2ImageId: (person2ImageId: string | null) => {
		podcast42Store.setState((state) => ({ ...state, person2ImageId }));
	},

	setPerson2ImageUrl: (person2ImageUrl: string | null) => {
		podcast42Store.setState((state) => ({ ...state, person2ImageUrl }));
	},

	setPerson2FalImageUrl: (person2FalImageUrl: string | null) => {
		podcast42Store.setState((state) => ({ ...state, person2FalImageUrl }));
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

	// Video queue actions
	addToVideoQueue: (sceneId: string) => {
		podcast42Store.setState((state) => {
			// Don't add if already in queue or currently processing
			if (
				state.videoQueue.includes(sceneId) ||
				state.currentProcessingSceneId === sceneId
			) {
				return state;
			}
			return { ...state, videoQueue: [...state.videoQueue, sceneId] };
		});
	},

	removeFromVideoQueue: (sceneId: string) => {
		podcast42Store.setState((state) => ({
			...state,
			videoQueue: state.videoQueue.filter((id) => id !== sceneId),
		}));
	},

	setCurrentProcessingSceneId: (sceneId: string | null) => {
		podcast42Store.setState((state) => ({
			...state,
			currentProcessingSceneId: sceneId,
		}));
	},

	// Get queue position (1-based, 0 means not in queue)
	getQueuePosition: (sceneId: string): number => {
		const state = podcast42Store.state;
		const index = state.videoQueue.indexOf(sceneId);
		return index === -1 ? 0 : index + 1;
	},

	// Check if scene is in queue or processing
	isSceneQueued: (sceneId: string): boolean => {
		const state = podcast42Store.state;
		return state.videoQueue.includes(sceneId);
	},

	isSceneProcessing: (sceneId: string): boolean => {
		return podcast42Store.state.currentProcessingSceneId === sceneId;
	},

	clearVideoQueue: () => {
		podcast42Store.setState((state) => ({
			...state,
			videoQueue: [],
			currentProcessingSceneId: null,
		}));
	},

	// Reset all state except playScript
	resetPrompts: () => {
		podcast42Store.setState((state) => ({
			...state,
			storyId: null,
			sceneDbIds: {},
			person1Prompt: null,
			person1ImageId: null,
			person1ImageUrl: null,
			person1FalImageUrl: null,
			person2Prompt: null,
			person2ImageId: null,
			person2ImageUrl: null,
			person2FalImageUrl: null,
			scenes: [],
			promptsGenerated: false,
			error: null,
			sceneError: null,
			isExportingVideo: false,
			exportedVideoUrl: null,
			exportError: null,
			videoQueue: [],
			currentProcessingSceneId: null,
		}));
	},

	// Full reset
	reset: () => {
		podcast42Store.setState(() => initialState);
	},
};
