import { Store } from "@tanstack/store";

// ============================================================================
// Message Types
// ============================================================================

export type AssistantMessageRole = "user" | "assistant" | "system" | "tool";

export interface AssistantToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export interface AssistantToolResult {
	name: string;
	arguments: Record<string, unknown>;
	result: unknown;
}

export interface AssistantMessage {
	id: string;
	role: AssistantMessageRole;
	content: string;
	toolCalls?: AssistantToolCall[];
	toolResults?: AssistantToolResult[];
	timestamp: number;
}

// ============================================================================
// Context Summaries for AI
// ============================================================================

export interface CharacterSummary {
	name: string;
	imagePrompt: string;
	hasImage: boolean;
}

export interface SceneSummary {
	id: string;
	orderIndex: number;
	caption: string;
	imagePrompt: string;
	videoPrompt: string;
	hasImage: boolean;
	hasAudio: boolean;
	hasVideo: boolean;
}

export interface ProjectContext {
	storyId: string | null;
	title: string;
	character: CharacterSummary | null;
	scenes: SceneSummary[];
}

// ============================================================================
// Main State
// ============================================================================

export interface DirectorAssistantState {
	// Chat state
	messages: AssistantMessage[];
	isLoading: boolean;
	error: string | null;

	// System prompt components
	userPreferences: string | null;
	projectContext: ProjectContext | null;

	// UI state
	isOpen: boolean;
	isMinimized: boolean;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: DirectorAssistantState = {
	messages: [],
	isLoading: false,
	error: null,

	userPreferences: null,
	projectContext: null,

	isOpen: false,
	isMinimized: false,
};

// ============================================================================
// Store Instance
// ============================================================================

export const directorAssistantStore = new Store<DirectorAssistantState>(
	initialState,
);

// ============================================================================
// Actions
// ============================================================================

export const directorAssistantActions = {
	// Chat UI
	setIsOpen: (isOpen: boolean) =>
		directorAssistantStore.setState((s) => ({
			...s,
			isOpen,
			isMinimized: false,
		})),

	toggleOpen: () =>
		directorAssistantStore.setState((s) => ({
			...s,
			isOpen: !s.isOpen,
			isMinimized: false,
		})),

	setIsMinimized: (isMinimized: boolean) =>
		directorAssistantStore.setState((s) => ({ ...s, isMinimized })),

	// Messages
	addMessage: (message: Omit<AssistantMessage, "id" | "timestamp">) =>
		directorAssistantStore.setState((s) => ({
			...s,
			messages: [
				...s.messages,
				{
					...message,
					id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
					timestamp: Date.now(),
				},
			],
		})),

	updateLastMessage: (updates: Partial<AssistantMessage>) =>
		directorAssistantStore.setState((s) => {
			const messages = [...s.messages];
			if (messages.length > 0) {
				messages[messages.length - 1] = {
					...messages[messages.length - 1],
					...updates,
				};
			}
			return { ...s, messages };
		}),

	clearMessages: () =>
		directorAssistantStore.setState((s) => ({ ...s, messages: [] })),

	// Loading states
	setIsLoading: (isLoading: boolean) =>
		directorAssistantStore.setState((s) => ({ ...s, isLoading })),

	setError: (error: string | null) =>
		directorAssistantStore.setState((s) => ({ ...s, error })),

	// Context
	setUserPreferences: (userPreferences: string | null) =>
		directorAssistantStore.setState((s) => ({ ...s, userPreferences })),

	setProjectContext: (projectContext: ProjectContext | null) =>
		directorAssistantStore.setState((s) => ({ ...s, projectContext })),

	// Reset
	reset: () => directorAssistantStore.setState(() => initialState),
};

// ============================================================================
// System Prompt Builder
// ============================================================================

export function buildSystemPrompt(state: DirectorAssistantState): string {
	let systemPrompt = `You are a Director Assistant helping users create engaging short-form videos.

Your role is to:
1. Help design compelling video narratives with strong hooks
2. Suggest scene compositions and visual styles
3. Craft engaging captions that maximize viewer retention
4. Search the web for references, trends, and inspiration when helpful

CRITICAL GUIDELINES:
- Focus on creating content with STRONG HOOKS in the first 3 seconds
- Suggest retention techniques: pattern interrupts, curiosity gaps, visual variety
- Keep captions concise and punchy
- Consider pacing and emotional arc across scenes
- You do NOT set image/video engines or voices - the user controls those
- You CAN add, modify, or delete scenes
- You CAN modify the character description/prompt

AVAILABLE TOOLS:
1. web_search - Search the web for references, trends, or inspiration
2. set_story_title - Set the story title (use sparingly, only when explicitly requested or at conversation start)
3. add_scene - Add a new scene to the project
4. update_scene - Modify an existing scene's caption, image prompt, or video instruction
5. delete_scene - Remove a scene from the project (cannot delete if only 1 scene)
6. update_character - Modify the character's image prompt

TOOL USAGE GUIDELINES:
- set_story_title: Only use when user explicitly asks for a title, or to suggest ONE title at the START of a new conversation. Do NOT repeatedly change the title during conversation.
- When using tools, explain what you're doing and why. After tool execution, summarize the changes made.
`;

	// Add user preferences if available
	if (state.userPreferences) {
		systemPrompt += `
USER PREFERENCES:
${state.userPreferences}
`;
	}

	// Add project context if available
	if (state.projectContext) {
		const ctx = state.projectContext;
		systemPrompt += `
CURRENT PROJECT STATE:
- Title: ${ctx.title || "(untitled)"}
- Story ID: ${ctx.storyId || "(not saved yet)"}
`;

		if (ctx.character) {
			systemPrompt += `
CHARACTER:
- Name: ${ctx.character.name || "(unnamed)"}
- Image Prompt: ${ctx.character.imagePrompt || "(no description)"}
- Has Image: ${ctx.character.hasImage ? "Yes" : "No"}
`;
		} else {
			systemPrompt += `
CHARACTER: Not yet created
`;
		}

		systemPrompt += `
SCENES (${ctx.scenes.length} total):
`;

		if (ctx.scenes.length > 0) {
			ctx.scenes.forEach((scene, idx) => {
				systemPrompt += `
Scene ${idx + 1}:
  - Caption: "${scene.caption || "(empty)"}"
  - Image Prompt: "${scene.imagePrompt || "(empty)"}"
  - Video Instruction: "${scene.videoPrompt || "(empty)"}"
  - Status: Image=${scene.hasImage ? "✓" : "✗"}, Audio=${scene.hasAudio ? "✓" : "✗"}, Video=${scene.hasVideo ? "✓" : "✗"}
`;
			});
		} else {
			systemPrompt += "  No scenes created yet.\n";
		}
	}

	return systemPrompt;
}
