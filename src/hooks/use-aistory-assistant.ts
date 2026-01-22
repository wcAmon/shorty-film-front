import { useStore } from "@tanstack/react-store";
import { useState, useRef, useEffect, useCallback } from "react";
import {
	aistoryAssistantStore,
	aistoryAssistantActions,
	buildAIStorySystemPrompt,
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
	const saveConversationToDb = useCallback(() => {
		if (!storyId || messages.length === 0) return;

		const messagesToSave: ConversationMessage[] = messages.map((m) => ({
			id: m.id,
			role: m.role as "user" | "assistant",
			content: m.content,
			toolResults: m.toolResults,
			timestamp: m.timestamp,
		}));

		saveConversation.mutate({ storyId, messages: messagesToSave });
	}, [storyId, messages, saveConversation]);

	// Save conversation when messages change (debounced by dependency)
	useEffect(() => {
		// Only save after we've loaded (or confirmed empty) for this storyId
		if (loadedForStoryId === storyId && messages.length > 0 && storyId) {
			// Use a small timeout to batch rapid changes
			const timer = setTimeout(saveConversationToDb, 500);
			return () => clearTimeout(timer);
		}
	}, [messages, loadedForStoryId, storyId, saveConversationToDb]);

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
	const imageStyle = useStore(aistoryStore, (s) => s.imageStyle);
	const characterPrompt = useStore(aistoryStore, (s) => s.characterPrompt);
	const characterImageUrl = useStore(aistoryStore, (s) => s.characterImageUrl);
	const scenes = useStore(aistoryStore, (s) => s.scenes);

	useEffect(() => {
		aistoryAssistantActions.setProjectContext({
			storyId,
			title: "", // AIStory doesn't have explicit title in store, could be derived
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
	}, [storyId, script, imageStyle, characterPrompt, characterImageUrl, scenes]);

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
				}>;
				const currentScenes = aistoryStore.state.scenes;

				for (const update of updates) {
					const { sceneIndex, caption, imagePrompt, videoPrompt } = update;
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
						if (Object.keys(sceneUpdates).length > 0) {
							aistoryActions.updateScene(sceneId, sceneUpdates);
						}
					}
				}
			}

			// Handle delete_scene - update local store
			if (tool.name === "delete_scene" && result.success) {
				// Use deletedSceneId from result (most reliable)
				if (result.deletedSceneId) {
					console.log("[AIStoryAssistant] Deleting scene by ID:", result.deletedSceneId);
					aistoryActions.deleteScene(result.deletedSceneId as string);
				}
			}

			// Handle delete_scenes (batch) - update local store
			if (tool.name === "delete_scenes" && result.success) {
				const deletedSceneIds = result.deletedSceneIds as string[];
				console.log("[AIStoryAssistant] Batch deleting scenes:", deletedSceneIds);
				// Delete in the order provided (already sorted descending by backend)
				for (const sceneId of deletedSceneIds) {
					aistoryActions.deleteScene(sceneId);
				}
			}

			// Handle set_story_title - AIStory doesn't have a title field in store
			// But we could potentially store it differently if needed in the future
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
			});

			// Process tool results to update local store
			console.log("[AIStoryAssistant] toolCalls received:", result.toolCalls);
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
	}, [inputValue, isLoading, storyId, sendMessage, processToolResults]);

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

	return {
		// State
		isOpen,
		isMinimized,
		messages,
		isLoading,
		error,
		inputValue,
		storyId,

		// Refs
		messagesEndRef,
		inputRef,

		// Mutations
		clearConversation,

		// Setters
		setInputValue,

		// Handlers
		handleSend,
		handleKeyDown,
		handleClearConversation,
	};
}
