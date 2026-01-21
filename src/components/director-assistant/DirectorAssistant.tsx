import { useStore } from "@tanstack/react-store";
import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Minus, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	directorAssistantStore,
	directorAssistantActions,
	buildSystemPrompt,
} from "@/stores/director-assistant.store";
import { directorStore } from "@/stores/director.store";
import {
	useSendAssistantMessage,
	useUserPreferences,
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
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);

	const sendMessage = useSendAssistantMessage();
	const { data: preferencesData } = useUserPreferences();

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
	const storyId = useStore(directorStore, (s) => s.storyId);
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
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
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
				{messages.length === 0 && (
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
						placeholder="Ask me anything about your video..."
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
