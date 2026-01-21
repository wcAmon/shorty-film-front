import { useStore } from "@tanstack/react-store";
import { useState, useRef, useEffect, useCallback } from "react";
import { MessageSquare, X, Minus, Send, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	directorAssistantStore,
	directorAssistantActions,
	buildSystemPrompt,
	type AssistantMessage,
} from "@/stores/director-assistant.store";
import { directorStore, directorActions } from "@/stores/director.store";
import {
	useSendAssistantMessage,
	useUserPreferences,
	useConversationHistory,
	useSaveConversationHistory,
	useClearConversationHistory,
	type ToolCallResult,
	type ConversationMessage,
} from "@/hooks/use-assistant-api";
import { AssistantMessageBubble } from "./AssistantMessage";
import { AssistantToolCall } from "./AssistantToolCall";

export function DirectorAssistant() {
	const isOpen = useStore(directorAssistantStore, (s) => s.isOpen);
	const isMinimized = useStore(directorAssistantStore, (s) => s.isMinimized);
	const messages = useStore(directorAssistantStore, (s) => s.messages);
	const isLoading = useStore(directorAssistantStore, (s) => s.isLoading);
	const error = useStore(directorAssistantStore, (s) => s.error);

	const [inputValue, setInputValue] = useState("");
	const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const sendMessage = useSendAssistantMessage();
	const { data: preferencesData } = useUserPreferences();
	const saveConversation = useSaveConversationHistory();
	const clearConversation = useClearConversationHistory();

	// Get storyId from director store
	const storyId = useStore(directorStore, (s) => s.storyId);

	// Fetch conversation history
	const { data: conversationData, isLoading: isLoadingHistory } =
		useConversationHistory(storyId);

	// Load conversation history into store when data is fetched
	useEffect(() => {
		if (
			conversationData?.success &&
			conversationData.messages.length > 0 &&
			!hasLoadedHistory &&
			storyId
		) {
			// Convert ConversationMessage[] to AssistantMessage[]
			const loadedMessages: Omit<AssistantMessage, "id" | "timestamp">[] =
				conversationData.messages.map((m) => ({
					role: m.role,
					content: m.content,
					toolResults: m.toolResults,
				}));

			// Clear existing messages and load from database
			directorAssistantActions.clearMessages();
			for (const msg of loadedMessages) {
				directorAssistantActions.addMessage(msg);
			}
			setHasLoadedHistory(true);
		}
	}, [conversationData, hasLoadedHistory, storyId]);

	// Reset hasLoadedHistory when storyId changes
	useEffect(() => {
		setHasLoadedHistory(false);
		directorAssistantActions.clearMessages();
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
		if (hasLoadedHistory && messages.length > 0 && storyId) {
			// Use a small timeout to batch rapid changes
			const timer = setTimeout(saveConversationToDb, 500);
			return () => clearTimeout(timer);
		}
	}, [messages, hasLoadedHistory, storyId, saveConversationToDb]);

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
	const character = useStore(directorStore, (s) => s.character);
	const scenes = useStore(directorStore, (s) => s.scenes);

	useEffect(() => {
		directorAssistantActions.setProjectContext({
			storyId,
			title,
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
	}, [storyId, title, character, scenes]);

	// Process tool results to update local store when needed
	const processToolResults = (toolCalls: ToolCallResult[] | undefined) => {
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
					if (Object.keys(updates).length > 0) {
						directorActions.updateScene(sceneId, updates);
					}
				}
			}

			// Handle set_story_title - update local store
			if (tool.name === "set_story_title" && result.success && result.title) {
				directorActions.setTitle(result.title as string);
			}
		}
	};

	const handleSend = async () => {
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
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		// Send on Shift+Enter, allow regular Enter for newlines
		if (e.key === "Enter" && e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const handleClearConversation = () => {
		if (!storyId) return;

		// Clear local store
		directorAssistantActions.clearMessages();

		// Clear from database
		clearConversation.mutate(storyId, {
			onSuccess: () => {
				setHasLoadedHistory(true); // Mark as loaded so auto-save works again
			},
		});
	};

	// Floating button when closed
	if (!isOpen) {
		return (
			<button
				onClick={() => directorAssistantActions.setIsOpen(true)}
				className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg transition-all hover:scale-110 hover:from-purple-400 hover:to-pink-400"
				title="Open AI Assistant"
			>
				<MessageSquare className="h-6 w-6" />
			</button>
		);
	}

	// Minimized state
	if (isMinimized) {
		return (
			<button
				onClick={() => directorAssistantActions.setIsMinimized(false)}
				className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2 text-white shadow-lg transition-all hover:from-purple-400 hover:to-pink-400"
			>
				<MessageSquare className="h-5 w-5" />
				<span className="font-medium">Director AI</span>
			</button>
		);
	}

	// Full chat widget
	return (
		<Card className="fixed bottom-6 right-6 z-50 flex h-[32rem] w-96 flex-col border-purple-500/30 shadow-2xl">
			{/* Header */}
			<div className="flex items-center justify-between rounded-t-lg border-b border-border bg-gradient-to-r from-purple-500/20 to-pink-500/20 p-4">
				<div className="flex items-center gap-2">
					<MessageSquare className="h-5 w-5 text-purple-400" />
					<span className="font-semibold text-foreground">
						Director Assistant
					</span>
				</div>
				<div className="flex items-center gap-1">
					{messages.length > 0 && (
						<button
							onClick={handleClearConversation}
							className="rounded-md p-1.5 transition-colors hover:bg-red-500/20"
							title="Clear conversation"
							disabled={clearConversation.isPending}
						>
							<Trash2 className="h-4 w-4 text-muted-foreground hover:text-red-400" />
						</button>
					)}
					<button
						onClick={() => directorAssistantActions.setIsMinimized(true)}
						className="rounded-md p-1.5 transition-colors hover:bg-muted"
						title="Minimize"
					>
						<Minus className="h-4 w-4 text-muted-foreground" />
					</button>
					<button
						onClick={() => directorAssistantActions.setIsOpen(false)}
						className="rounded-md p-1.5 transition-colors hover:bg-muted"
						title="Close"
					>
						<X className="h-4 w-4 text-muted-foreground" />
					</button>
				</div>
			</div>

			{/* Messages */}
			<CardContent className="flex-1 space-y-4 overflow-y-auto p-4">
				{isLoadingHistory && (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="h-6 w-6 animate-spin text-purple-400" />
						<span className="ml-2 text-sm text-muted-foreground">
							Loading conversation...
						</span>
					</div>
				)}

				{!isLoadingHistory && messages.length === 0 && (
					<div className="py-8 text-center text-muted-foreground">
						<MessageSquare className="mx-auto mb-4 h-12 w-12 opacity-30" />
						<p className="text-sm">
							Hi! I'm your Director Assistant. I can help you:
						</p>
						<ul className="mt-2 space-y-1 text-xs">
							<li>- Design engaging video narratives</li>
							<li>- Create compelling hooks</li>
							<li>- Add/edit/delete scenes</li>
							<li>- Search for references & trends</li>
						</ul>
					</div>
				)}

				{messages.map((message) => (
					<div key={message.id}>
						<AssistantMessageBubble message={message} />
						{message.toolResults?.map((tr, idx) => (
							<AssistantToolCall key={`${message.id}-tool-${idx}`} toolResult={tr} />
						))}
					</div>
				))}

				{isLoading && (
					<div className="flex items-center gap-2 text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						<span className="text-sm">Thinking...</span>
					</div>
				)}

				{error && (
					<div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
						{error}
					</div>
				)}

				<div ref={messagesEndRef} />
			</CardContent>

			{/* Input */}
			<div className="border-t border-border p-4">
				<div className="flex gap-2">
					<textarea
						ref={inputRef}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Ask me anything... (Shift+Enter to send)"
						className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
						rows={2}
						disabled={isLoading}
					/>
					<Button
						onClick={handleSend}
						disabled={!inputValue.trim() || isLoading}
						className="bg-gradient-to-r from-purple-500 to-pink-500 px-3 hover:from-purple-400 hover:to-pink-400"
					>
						{isLoading ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Send className="h-4 w-4" />
						)}
					</Button>
				</div>
			</div>
		</Card>
	);
}
