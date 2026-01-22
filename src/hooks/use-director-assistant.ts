import { useStore } from "@tanstack/react-store";
import { useState, useRef, useEffect, useCallback } from "react";
import {
	directorAssistantStore,
	directorAssistantActions,
	buildSystemPrompt,
} from "@/stores/director-assistant.store";
import { directorStore, directorActions } from "@/stores/director.store";
import {
	useSendAssistantMessage,
	useUserPreferences,
	useSaveConversationHistory,
	useClearConversationHistory,
	type ToolCallResult,
	type ConversationMessage,
} from "@/hooks/use-assistant-api";

/**
 * Hook that encapsulates all Director Assistant chat logic.
 * Can be used by both the floating widget (DirectorAssistant) and
 * the embedded panel (DirectorAssistantPanel).
 */
export function useDirectorAssistant() {
	const isOpen = useStore(directorAssistantStore, (s) => s.isOpen);
	const isMinimized = useStore(directorAssistantStore, (s) => s.isMinimized);
	const messages = useStore(directorAssistantStore, (s) => s.messages);
	const isLoading = useStore(directorAssistantStore, (s) => s.isLoading);
	const error = useStore(directorAssistantStore, (s) => s.error);

	const [inputValue, setInputValue] = useState("");
	const [loadedForStoryId, setLoadedForStoryId] = useState<string | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const sendMessage = useSendAssistantMessage();
	const { data: preferencesData } = useUserPreferences();
	const saveConversation = useSaveConversationHistory();
	const clearConversation = useClearConversationHistory();

	// Get storyId from director store
	const storyId = useStore(directorStore, (s) => s.storyId);

	// Conversation history is now loaded from story data in handleResume (user.tsx)
	// No separate API call needed - messages are set directly to directorAssistantStore
	// via directorAssistantActions.setMessages() when resuming from history

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
			directorAssistantActions.setUserPreferences(
				preferencesData.preferences.preferenceSummary,
			);
		}
	}, [preferencesData]);

	// Sync project context from director store
	const title = useStore(directorStore, (s) => s.title);
	const defaultImageStyle = useStore(directorStore, (s) => s.defaultImageStyle);
	const character = useStore(directorStore, (s) => s.character);
	const scenes = useStore(directorStore, (s) => s.scenes);

	useEffect(() => {
		directorAssistantActions.setProjectContext({
			storyId,
			title,
			imageStyle: defaultImageStyle,
			character: character
				? {
						name: character.name,
						imagePrompt: character.imagePrompt,
						hasImage: !!character.imageUrl,
					}
				: null,
			scenes: scenes.map((s) => ({
				id: s.id,
				orderIndex: s.orderIndex,
				caption: s.caption,
				imagePrompt: s.imagePrompt,
				videoPrompt: s.videoPrompt,
				hasImage: !!s.imageUrl,
				hasAudio: !!s.audioUrl,
				hasVideo: !!s.videoUrl,
			})),
		});
	}, [storyId, title, defaultImageStyle, character, scenes]);

	// Process tool results to update local store when needed
	const processToolResults = useCallback((toolCalls: ToolCallResult[] | undefined) => {
		if (!toolCalls) return;

		for (const tool of toolCalls) {
			const result = tool.result as Record<string, unknown> | null;
			if (!result || result.error) continue;

			// Handle update_character - update local store (works with or without storyId)
			if (tool.name === "update_character" && result.success && result.imagePrompt) {
				const currentCharacter = directorStore.state.character;
				if (currentCharacter) {
					directorActions.updateCharacter({
						imagePrompt: result.imagePrompt as string,
					});
				} else {
					// Create a new character with the prompt (no image yet)
					directorActions.setCharacter({
						id: `char-${Date.now()}`,
						name: "Main Character",
						imagePrompt: result.imagePrompt as string,
						imageUrl: null,
						imageId: null,
						imageSource: "generate",
						imageEngine: directorStore.state.defaultImageEngine,
						voiceId: directorStore.state.defaultVoiceId,
						voiceSpeed: directorStore.state.defaultVoiceSpeed,
						videoEngine: directorStore.state.defaultVideoEngine,
						isGenerating: false,
						imageStatus: null,
					});
				}
			}

			// Handle add_scene - add new scene to local store
			if (tool.name === "add_scene" && result.success && result.sceneId) {
				// Get scene data from tool arguments (not result)
				const args = tool.arguments;
				directorActions.addSceneWithData(
					result.sceneId as string,
					result.orderIndex as number,
					{
						caption: args.caption as string | undefined,
						imagePrompt: args.imagePrompt as string | undefined,
						videoPrompt: args.videoPrompt as string | undefined,
					},
				);
			}

			// Handle add_scenes (batch) - add multiple scenes to local store
			if (tool.name === "add_scenes" && result.success && result.addedScenes) {
				const args = tool.arguments;
				const scenesData = args.scenes as Array<{
					caption: string;
					imagePrompt: string;
					videoPrompt: string;
				}>;
				const addedScenes = result.addedScenes as Array<{
					sceneId: string;
					orderIndex: number;
				}>;

				// Add each scene with its data
				for (let i = 0; i < addedScenes.length; i++) {
					const added = addedScenes[i];
					const data = scenesData[i];
					if (added && data) {
						directorActions.addSceneWithData(added.sceneId, added.orderIndex, {
							caption: data.caption,
							imagePrompt: data.imagePrompt,
							videoPrompt: data.videoPrompt,
						});
					}
				}
			}

			// Handle update_scene - update local store
			if (tool.name === "update_scene" && result.success) {
				// Get values from tool.arguments (not result, since backend doesn't return the values)
				const args = tool.arguments;
				const sceneIndex = args.sceneIndex as number;
				const currentScenes = directorStore.state.scenes;
				if (sceneIndex >= 0 && sceneIndex < currentScenes.length) {
					const sceneId = currentScenes[sceneIndex].id;
					const updates: Record<string, unknown> = {};
					// Only update if value is not null (null means keep unchanged)
					if (args.caption !== null && args.caption !== undefined)
						updates.caption = args.caption;
					if (args.imagePrompt !== null && args.imagePrompt !== undefined)
						updates.imagePrompt = args.imagePrompt;
					if (args.videoPrompt !== null && args.videoPrompt !== undefined)
						updates.videoPrompt = args.videoPrompt;
					if (args.useAvatar !== null && args.useAvatar !== undefined)
						updates.useAvatar = args.useAvatar;
					if (Object.keys(updates).length > 0) {
						directorActions.updateScene(sceneId, updates);
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
				}>;
				const currentScenes = directorStore.state.scenes;

				for (const update of updates) {
					const { sceneIndex, caption, imagePrompt, videoPrompt, useAvatar } = update;
					if (sceneIndex >= 0 && sceneIndex < currentScenes.length) {
						const sceneId = currentScenes[sceneIndex].id;
						const sceneUpdates: Record<string, unknown> = {};
						// Only update if value is not null (null means keep unchanged)
						if (caption !== null && caption !== undefined)
							sceneUpdates.caption = caption;
						if (imagePrompt !== null && imagePrompt !== undefined)
							sceneUpdates.imagePrompt = imagePrompt;
						if (videoPrompt !== null && videoPrompt !== undefined)
							sceneUpdates.videoPrompt = videoPrompt;
						if (useAvatar !== null && useAvatar !== undefined)
							sceneUpdates.useAvatar = useAvatar;
						if (Object.keys(sceneUpdates).length > 0) {
							directorActions.updateScene(sceneId, sceneUpdates);
						}
					}
				}
			}

			// Handle set_story_title - update local store
			if (tool.name === "set_story_title" && result.success && result.title) {
				directorActions.setTitle(result.title as string);
			}

			// Handle delete_scene - update local store
			if (tool.name === "delete_scene" && result.success) {
				// Use deletedSceneId from result (most reliable)
				if (result.deletedSceneId) {
					console.log("[DirectorAssistant] Deleting scene by ID:", result.deletedSceneId);
					directorActions.deleteScene(result.deletedSceneId as string);
				}
			}

			// Handle delete_scenes (batch) - update local store
			if (tool.name === "delete_scenes" && result.success) {
				const deletedSceneIds = result.deletedSceneIds as string[];
				console.log("[DirectorAssistant] Batch deleting scenes:", deletedSceneIds);
				// Delete in the order provided (already sorted descending by backend)
				for (const sceneId of deletedSceneIds) {
					directorActions.deleteScene(sceneId);
				}
			}
		}
	}, []);

	const handleSend = useCallback(async () => {
		if (!inputValue.trim() || isLoading) return;

		const userMessage = inputValue.trim();
		setInputValue("");

		// Add user message to store
		directorAssistantActions.addMessage({
			role: "user",
			content: userMessage,
		});

		// Build system prompt
		const state = directorAssistantStore.state;
		const systemPrompt = buildSystemPrompt(state);

		// Prepare conversation history
		const conversationHistory = state.messages.map((m) => ({
			role: m.role as "user" | "assistant",
			content: m.content,
		}));
		conversationHistory.push({ role: "user", content: userMessage });

		// Send to API
		directorAssistantActions.setIsLoading(true);
		directorAssistantActions.setError(null);

		try {
			const result = await sendMessage.mutateAsync({
				storyId,
				messages: conversationHistory,
				systemPrompt,
			});

			// Process tool results to update local store
			processToolResults(result.toolCalls);

			// Add assistant response
			directorAssistantActions.addMessage({
				role: "assistant",
				content: result.response,
				toolResults: result.toolCalls,
			});
		} catch (err) {
			directorAssistantActions.setError(
				err instanceof Error ? err.message : "Failed to send message",
			);
		} finally {
			directorAssistantActions.setIsLoading(false);
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
		directorAssistantActions.clearMessages();

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
