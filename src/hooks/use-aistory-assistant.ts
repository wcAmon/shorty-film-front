import { useStore } from "@tanstack/react-store";
import { useState, useRef, useEffect, useCallback } from "react";
import {
	aistoryAssistantStore,
	aistoryAssistantActions,
	buildAIStorySystemPrompt,
	type AssistantLLMEngine,
} from "@/stores/aistory-assistant.store";
import { aistoryStore, aistoryActions } from "@/stores/aistory.store";
import {
	useSendAssistantMessage,
	useUserPreferences,
	useSaveConversationHistory,
	useClearConversationHistory,
	type ToolCallResult,
	type ConversationMessage,
} from "@/hooks/use-assistant-api";

/**
 * Hook that encapsulates all AIStory Assistant chat logic.
 * Can be used by both floating widget and embedded panel.
 */
export function useAIStoryAssistant() {
	const isOpen = useStore(aistoryAssistantStore, (s) => s.isOpen);
	const isMinimized = useStore(aistoryAssistantStore, (s) => s.isMinimized);
	const messages = useStore(aistoryAssistantStore, (s) => s.messages);
	const isLoading = useStore(aistoryAssistantStore, (s) => s.isLoading);
	const error = useStore(aistoryAssistantStore, (s) => s.error);
	const llmEngine = useStore(aistoryAssistantStore, (s) => s.llmEngine);

	const [inputValue, setInputValue] = useState("");
	const [loadedForStoryId, setLoadedForStoryId] = useState<string | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const sendMessage = useSendAssistantMessage();
	const { data: preferencesData } = useUserPreferences();
	const saveConversation = useSaveConversationHistory();
	const clearConversation = useClearConversationHistory();

	// Get storyId from aistory store
	const storyId = useStore(aistoryStore, (s) => s.storyId);

	// Track storyId changes to mark when history is "loaded" for save logic
	const prevStoryIdRef = useRef<string | null>(null);

	useEffect(() => {
		if (storyId !== prevStoryIdRef.current) {
			prevStoryIdRef.current = storyId;
			// Mark as loaded for this storyId (history comes from story data or is empty for new stories)
			setLoadedForStoryId(storyId);
		}
	}, [storyId]);

	// Auto-save conversation after messages change
	// Use ref to avoid dependency on saveConversation mutation object
	const saveConversationRef = useRef(saveConversation);
	saveConversationRef.current = saveConversation;

	// Save conversation when messages change (debounced)
	useEffect(() => {
		// Only save after we've loaded (or confirmed empty) for this storyId
		if (loadedForStoryId === storyId && messages.length > 0 && storyId) {
			// Use a small timeout to batch rapid changes
			const timer = setTimeout(() => {
				const messagesToSave: ConversationMessage[] = messages.map((m) => ({
					id: m.id,
					role: m.role as "user" | "assistant",
					content: m.content,
					toolResults: m.toolResults,
					timestamp: m.timestamp,
				}));
				saveConversationRef.current.mutate({ storyId, messages: messagesToSave });
			}, 500);
			return () => clearTimeout(timer);
		}
	}, [messages, loadedForStoryId, storyId]);

	// Auto-scroll to bottom
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	// Load user preferences into store
	useEffect(() => {
		if (preferencesData?.preferences?.preferenceSummary) {
			aistoryAssistantActions.setUserPreferences(
				preferencesData.preferences.preferenceSummary,
			);
		}
	}, [preferencesData]);

	// Sync project context from aistory store
	const script = useStore(aistoryStore, (s) => s.script);
	const storyTitle = useStore(aistoryStore, (s) => s.storyTitle);
	const imageStyle = useStore(aistoryStore, (s) => s.imageStyle);
	const characterPrompt = useStore(aistoryStore, (s) => s.characterPrompt);
	const characterImageUrl = useStore(aistoryStore, (s) => s.characterImageUrl);
	const scenes = useStore(aistoryStore, (s) => s.scenes);

	useEffect(() => {
		aistoryAssistantActions.setProjectContext({
			storyId,
			title: storyTitle || "",
			script,
			imageStyle,
			character: characterPrompt
				? {
						imagePrompt: characterPrompt,
						hasImage: !!characterImageUrl,
					}
				: null,
			scenes: scenes.map((s, idx) => ({
				id: s.id,
				orderIndex: idx,
				caption: s.caption || "",
				imagePrompt: s.prompt || "",
				videoPrompt: s.video_prompt || "",
				hasImage: !!s.imageUrl,
				hasAudio: !!s.audioUrl,
				hasVideo: !!s.videoUrl,
			})),
		});
	}, [storyId, storyTitle, script, imageStyle, characterPrompt, characterImageUrl, scenes]);

	// Process tool results to update local store when needed
	const processToolResults = useCallback((toolCalls: ToolCallResult[] | undefined) => {
		if (!toolCalls) return;

		for (const tool of toolCalls) {
			const result = tool.result as Record<string, unknown> | null;
			if (!result || result.error) continue;

			// Handle update_character - update local store
			if (tool.name === "update_character" && result.success && result.imagePrompt) {
				aistoryActions.setCharacterPrompt(result.imagePrompt as string);
			}

			// Handle update_scene - update local store
			if (tool.name === "update_scene" && result.success) {
				const args = tool.arguments;
				const sceneIndex = args.sceneIndex as number;
				const currentScenes = aistoryStore.state.scenes;
				if (sceneIndex >= 0 && sceneIndex < currentScenes.length) {
					const sceneId = currentScenes[sceneIndex].id;
					const updates: Record<string, unknown> = {};
					// Only update if value is not null (null means keep unchanged)
					if (args.caption !== null && args.caption !== undefined)
						updates.caption = args.caption;
					if (args.imagePrompt !== null && args.imagePrompt !== undefined)
						updates.prompt = args.imagePrompt; // AIStory uses 'prompt' instead of 'imagePrompt'
					if (args.videoPrompt !== null && args.videoPrompt !== undefined)
						updates.video_prompt = args.videoPrompt; // AIStory uses 'video_prompt' with underscore
					if (args.useAvatar !== null && args.useAvatar !== undefined)
						updates.useAvatar = args.useAvatar;
					if (args.title !== null && args.title !== undefined)
						updates.title = args.title;
					if (Object.keys(updates).length > 0) {
						aistoryActions.updateScene(sceneId, updates);
					}
				}
			}

			// Handle update_scenes (batch) - update multiple scenes in local store
			if (tool.name === "update_scenes" && result.success && result.results) {
				const args = tool.arguments;
				const updates = args.updates as Array<{
					sceneIndex: number;
					caption: string | null;
					imagePrompt: string | null;
					videoPrompt: string | null;
					useAvatar?: boolean | null;
					title?: string | null;
				}>;
				const currentScenes = aistoryStore.state.scenes;

				for (const update of updates) {
					const { sceneIndex, caption, imagePrompt, videoPrompt, useAvatar, title } = update;
					if (sceneIndex >= 0 && sceneIndex < currentScenes.length) {
						const sceneId = currentScenes[sceneIndex].id;
						const sceneUpdates: Record<string, unknown> = {};
						// Only update if value is not null (null means keep unchanged)
						if (caption !== null && caption !== undefined)
							sceneUpdates.caption = caption;
						if (imagePrompt !== null && imagePrompt !== undefined)
							sceneUpdates.prompt = imagePrompt; // AIStory uses 'prompt' instead of 'imagePrompt'
						if (videoPrompt !== null && videoPrompt !== undefined)
							sceneUpdates.video_prompt = videoPrompt; // AIStory uses 'video_prompt' with underscore
						if (useAvatar !== null && useAvatar !== undefined)
							sceneUpdates.useAvatar = useAvatar;
						if (title !== null && title !== undefined)
							sceneUpdates.title = title;
						if (Object.keys(sceneUpdates).length > 0) {
							aistoryActions.updateScene(sceneId, sceneUpdates);
						}
					}
				}
			}

			// Handle delete_scene - update local store
			if (tool.name === "delete_scene" && result.success) {
				if (result.deletedSceneId) {
					aistoryActions.deleteScene(result.deletedSceneId as string);
				}
			}

			// Handle delete_scenes (batch) - update local store
			if (tool.name === "delete_scenes" && result.success) {
				const deletedSceneIds = result.deletedSceneIds as string[];
				for (const sceneId of deletedSceneIds) {
					aistoryActions.deleteScene(sceneId);
				}
			}

			// Handle update_character_and_scenes - update both character and scenes in local store
			if (tool.name === "update_character_and_scenes" && result.success) {
				const args = tool.arguments;
				const characterImagePrompt = args.characterImagePrompt as string;
				const sceneUpdates = args.sceneUpdates as Array<{
					sceneIndex: number;
					imagePrompt: string;
				}>;

				// Update character
				aistoryActions.setCharacterPrompt(characterImagePrompt);

				// Update scenes
				if (sceneUpdates && sceneUpdates.length > 0) {
					const currentScenes = aistoryStore.state.scenes;
					for (const update of sceneUpdates) {
						const { sceneIndex, imagePrompt } = update;
						if (sceneIndex >= 0 && sceneIndex < currentScenes.length) {
							const sceneId = currentScenes[sceneIndex].id;
							aistoryActions.updateScene(sceneId, { prompt: imagePrompt });
						}
					}
				}
			}

			// Handle set_story_title - update local store
			if (tool.name === "set_story_title" && result.success && result.title) {
				aistoryActions.setStoryTitle(result.title as string);
			}
		}
	}, []);

	const handleSend = useCallback(async () => {
		if (!inputValue.trim() || isLoading) return;

		const userMessage = inputValue.trim();
		setInputValue("");

		// Add user message to store
		aistoryAssistantActions.addMessage({
			role: "user",
			content: userMessage,
		});

		// Build system prompt
		const state = aistoryAssistantStore.state;
		const systemPrompt = buildAIStorySystemPrompt(state);

		// Prepare conversation history
		const conversationHistory = state.messages.map((m) => ({
			role: m.role as "user" | "assistant",
			content: m.content,
		}));
		conversationHistory.push({ role: "user", content: userMessage });

		// Send to API
		aistoryAssistantActions.setIsLoading(true);
		aistoryAssistantActions.setError(null);

		try {
			const result = await sendMessage.mutateAsync({
				storyId,
				messages: conversationHistory,
				systemPrompt,
				llmEngine,
			});

			// Process tool results to update local store
			processToolResults(result.toolCalls);

			// Add assistant response
			aistoryAssistantActions.addMessage({
				role: "assistant",
				content: result.response,
				toolResults: result.toolCalls,
			});
		} catch (err) {
			aistoryAssistantActions.setError(
				err instanceof Error ? err.message : "Failed to send message",
			);
		} finally {
			aistoryAssistantActions.setIsLoading(false);
		}
	}, [inputValue, isLoading, storyId, llmEngine, sendMessage, processToolResults]);

	const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
		// Send on Shift+Enter, allow regular Enter for newlines
		if (e.key === "Enter" && e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	}, [handleSend]);

	const handleClearConversation = useCallback(() => {
		if (!storyId) return;

		// Clear local store
		aistoryAssistantActions.clearMessages();

		// Clear from database
		clearConversation.mutate(storyId, {
			onSuccess: () => {
				// Keep loadedForStoryId as current storyId so auto-save works for new messages
				setLoadedForStoryId(storyId);
			},
		});
	}, [storyId, clearConversation]);

	const setLLMEngine = useCallback((engine: AssistantLLMEngine) => {
		aistoryAssistantActions.setLLMEngine(engine);
	}, []);

	return {
		// State
		isOpen,
		isMinimized,
		messages,
		isLoading,
		error,
		inputValue,
		storyId,
		llmEngine,

		// Refs
		messagesEndRef,
		inputRef,

		// Mutations
		clearConversation,

		// Setters
		setInputValue,
		setLLMEngine,

		// Handlers
		handleSend,
		handleKeyDown,
		handleClearConversation,
	};
}
