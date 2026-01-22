import { Store } from "@tanstack/store";

// ============================================================================
// Message Types (shared with Director Assistant)
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

export interface AIStoryCharacterSummary {
	imagePrompt: string;
	hasImage: boolean;
}

export interface AIStorySceneSummary {
	id: string;
	orderIndex: number;
	caption: string;
	imagePrompt: string;
	videoPrompt: string;
	hasImage: boolean;
	hasAudio: boolean;
	hasVideo: boolean;
}

export interface AIStoryProjectContext {
	storyId: string | null;
	title: string;
	script: string;
	imageStyle: string;
	character: AIStoryCharacterSummary | null;
	scenes: AIStorySceneSummary[];
}

// ============================================================================
// Main State
// ============================================================================

export interface AIStoryAssistantState {
	// Chat state
	messages: AssistantMessage[];
	isLoading: boolean;
	error: string | null;

	// System prompt components
	userPreferences: string | null;
	projectContext: AIStoryProjectContext | null;

	// UI state
	isOpen: boolean;
	isMinimized: boolean;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: AIStoryAssistantState = {
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

export const aistoryAssistantStore = new Store<AIStoryAssistantState>(
	initialState,
);

// ============================================================================
// Actions
// ============================================================================

export const aistoryAssistantActions = {
	// Chat UI
	setIsOpen: (isOpen: boolean) =>
		aistoryAssistantStore.setState((s) => ({
			...s,
			isOpen,
			isMinimized: false,
		})),

	toggleOpen: () =>
		aistoryAssistantStore.setState((s) => ({
			...s,
			isOpen: !s.isOpen,
			isMinimized: false,
		})),

	setIsMinimized: (isMinimized: boolean) =>
		aistoryAssistantStore.setState((s) => ({ ...s, isMinimized })),

	// Messages
	addMessage: (message: Omit<AssistantMessage, "id" | "timestamp">) =>
		aistoryAssistantStore.setState((s) => ({
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
		aistoryAssistantStore.setState((s) => {
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
		aistoryAssistantStore.setState((s) => ({ ...s, messages: [] })),

	// Set messages directly (for loading from database)
	setMessages: (messages: AssistantMessage[]) =>
		aistoryAssistantStore.setState((s) => ({ ...s, messages })),

	// Loading states
	setIsLoading: (isLoading: boolean) =>
		aistoryAssistantStore.setState((s) => ({ ...s, isLoading })),

	setError: (error: string | null) =>
		aistoryAssistantStore.setState((s) => ({ ...s, error })),

	// Context
	setUserPreferences: (userPreferences: string | null) =>
		aistoryAssistantStore.setState((s) => ({ ...s, userPreferences })),

	setProjectContext: (projectContext: AIStoryProjectContext | null) =>
		aistoryAssistantStore.setState((s) => ({ ...s, projectContext })),

	// Reset
	reset: () => aistoryAssistantStore.setState(() => initialState),
};

// ============================================================================
// System Prompt Builder
// ============================================================================

export function buildAIStorySystemPrompt(state: AIStoryAssistantState): string {
	let systemPrompt = `You are a Story Assistant helping users create engaging short-form videos from scripts.

LANGUAGE REQUIREMENT:
- Respond in Traditional Chinese (繁體中文) or English only
- NEVER use Simplified Chinese (简体中文)
- Match the user's language preference based on their messages

Your role is to:
1. Help refine and improve video scripts
2. Suggest scene compositions and visual styles
3. Craft engaging captions that maximize viewer retention
4. Help edit individual scenes after generation
5. Search the web for references, trends, and inspiration when helpful

CRITICAL GUIDELINES:
- AIStory mode generates scenes from a script automatically
- Focus on creating content with STRONG HOOKS in the first 3 seconds
- Suggest retention techniques: pattern interrupts, curiosity gaps, visual variety
- Keep captions concise and punchy
- Consider pacing and emotional arc across scenes
- You do NOT set image/video engines or voices - the user controls those globally
- You CAN modify scene captions and image prompts
- You CAN modify the character description/prompt

**CRITICAL** - CHARACTER REFERENCE IN IMAGE PROMPTS:
The system uses a character reference model to maintain visual consistency of the main character across scenes.
For this to work, you MUST include specific phrases in the image prompt.

MANDATORY RULES:
1. If a scene features the main character (person appearing in the scene), you MUST include one of these phrases at the START of the image prompt:
   - "use character image as reference, "
   - "reference the character image, "
   - "based on character reference, "
   Example: "use character image as reference, a young woman sitting at a cafe, looking thoughtfully out the window, soft afternoon light"

2. If a scene does NOT feature the main character (landscape, object close-up, text overlay, establishing shot without people), do NOT include character reference phrases.
   Example: "aerial view of a bustling city at sunset, golden hour lighting"

**IMAGE STYLE** - Apply style keywords to ALL image prompts:
The user selects an image style that determines the visual aesthetic. You MUST include the appropriate style keywords in EVERY image prompt.

STYLE DEFINITIONS:
- cinematic: "Realistic cinematic film still, high quality, strong composition, cinematic lighting"
- comic: "1950s American comic book cover style, bold ink outlines, halftone dots shading, pulp print texture, vintage color palette, dramatic heroic pose, cinematic rim light, strong shadows, high quality illustration, retro print look"
- low-poly: "Oil-Paint Diorama with Low-Poly Statues"
- japanese-anime: "Classic 1990s Japanese anime/manga style, traditional hand-drawn cel animation, bold black ink outlines, dramatic screentone shading, intense expressive eyes, dynamic action framing, vintage shonen anime aesthetic"
- clay: "Clay animation style, claymation, stop-motion miniature diorama, handcrafted clay figurines, visible polymer clay texture, subtle handmade imperfections, soft diffused lighting, tilt-shift miniature photography"

AVAILABLE TOOLS:
1. web_search - Search the web for references, trends, or inspiration
2. set_story_title - Set the story title (use sparingly, only when explicitly requested)
3. update_scene - Modify a single scene's caption, image prompt, video instruction, title, or useAvatar (pass null to keep unchanged)
4. update_scenes - Modify multiple scenes at once (more efficient for batch operations)
5. delete_scene - Remove a single scene from the project (cannot delete if only 1 scene)
6. delete_scenes - Remove multiple scenes at once (more efficient for batch deletions)
7. update_character - Modify the character's image prompt
8. update_character_and_scenes - Update character AND related scenes atomically (PREFERRED for character changes)

TOOL USAGE GUIDELINES:
- set_story_title: Only use when user explicitly asks for a title. Do NOT repeatedly change the title.
- PREFER BATCH TOOLS: When updating or deleting multiple scenes, use update_scenes/delete_scenes instead of calling update_scene/delete_scene multiple times.
- update_scene/update_scenes: You can update individual fields by passing null for fields you want to keep unchanged. For example, to only update the caption, pass { sceneIndex: 0, caption: "new text", imagePrompt: null, videoPrompt: null, useAvatar: null, title: null }
- update_scene/update_scenes: Can set useAvatar=true to enable avatar speak mode for a scene. Avatar mode uses the character image + audio to create a talking head video (no video prompt needed). Requires a character image to be set first.
- update_scene/update_scenes: Can set title to update the scene's title/name. This is a short descriptive name shown in the scene header.
- delete_scenes: Pass an array of scene indices to delete. Example: { sceneIndices: [2, 4, 5] } to delete scenes 3, 5, and 6.
- When using tools, explain what you're doing and why. After tool execution, summarize the changes made.

**COORDINATED UPDATES - Character + Scenes**:
When the user requests changes to the character's appearance, style, or description, ALWAYS use \`update_character_and_scenes\` tool instead of calling update_character and update_scenes separately.

This tool:
- Updates character imagePrompt
- Updates all scene imagePrompts that reference the character
- Executes as a single atomic operation

EXAMPLE:
User: "把角色改成穿藍色洋裝的女生"

You should call update_character_and_scenes({
  characterImagePrompt: "A young woman wearing an elegant blue dress, long black hair, gentle smile, cinematic lighting",
  sceneUpdates: [
    { sceneIndex: 0, imagePrompt: "use character image as reference, the woman in blue dress walking through a garden, soft sunlight, Realistic cinematic film still" },
    { sceneIndex: 1, imagePrompt: "use character image as reference, close-up of the woman in blue dress looking at camera, emotional expression, Realistic cinematic film still" },
  ]
})

IMPORTANT:
- Only include scenes that reference the character (have "use character image as reference" or similar phrases)
- Skip landscape/object-only scenes
- Maintain the scene's context while updating to reflect new character appearance
- Apply the current image style to all updated imagePrompts

NOTE: Unlike Director Mode, AIStory scenes are typically generated from a script. The add_scene tool is available but rarely needed since scenes come from script generation.
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
- Image Style: ${ctx.imageStyle || "cinematic"} (IMPORTANT: Apply this style to ALL image prompts!)
`;

		// Add script if available
		if (ctx.script) {
			systemPrompt += `
ORIGINAL SCRIPT:
"${ctx.script.substring(0, 500)}${ctx.script.length > 500 ? "..." : ""}"
`;
		}

		if (ctx.character) {
			systemPrompt += `
CHARACTER:
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
