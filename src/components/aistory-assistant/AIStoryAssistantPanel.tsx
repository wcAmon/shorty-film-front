import { Sparkles, Send, Loader2, Trash2, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAIStoryAssistant } from "@/hooks/use-aistory-assistant";
import { AssistantMessageBubble } from "./AssistantMessage";
import { AssistantToolCall } from "./AssistantToolCall";

interface AIStoryAssistantPanelProps {
	onCollapse: () => void;
}

/**
 * Embedded AIStory Assistant panel for IDE-style layout.
 * Unlike the floating widget, this is always visible and fills its container.
 */
export function AIStoryAssistantPanel({ onCollapse }: AIStoryAssistantPanelProps) {
	const {
		messages,
		isLoading,
		error,
		inputValue,
		messagesEndRef,
		inputRef,
		clearConversation,
		setInputValue,
		handleSend,
		handleKeyDown,
		handleClearConversation,
	} = useAIStoryAssistant();

	return (
		<div className="flex h-full flex-col bg-background">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-blue-500/10 to-cyan-500/10 p-3">
				<div className="flex items-center gap-2">
					<Sparkles className="h-4 w-4 text-blue-400" />
					<span className="text-sm font-semibold text-foreground">
						Story Assistant
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
						onClick={onCollapse}
						className="rounded-md p-1.5 transition-colors hover:bg-muted"
						title="Collapse panel"
					>
						<PanelRightClose className="h-4 w-4 text-muted-foreground" />
					</button>
				</div>
			</div>

			{/* Messages */}
			<div className="flex-1 space-y-4 overflow-y-auto p-4">
				{messages.length === 0 && (
					<div className="py-8 text-center text-muted-foreground">
						<Sparkles className="mx-auto mb-4 h-12 w-12 opacity-30" />
						<p className="text-sm">
							Hi! I'm your Story Assistant. I can help you:
						</p>
						<ul className="mt-2 space-y-1 text-xs">
							<li>- Improve your video script</li>
							<li>- Edit scene captions and prompts</li>
							<li>- Refine character descriptions</li>
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
			</div>

			{/* Input */}
			<div className="border-t border-border p-3">
				<div className="flex gap-2">
					<textarea
						ref={inputRef}
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Ask me anything... (Shift+Enter to send)"
						className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
						rows={2}
						disabled={isLoading}
					/>
					<Button
						onClick={handleSend}
						disabled={!inputValue.trim() || isLoading}
						className="bg-gradient-to-r from-blue-500 to-cyan-500 px-3 hover:from-blue-400 hover:to-cyan-400"
					>
						{isLoading ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Send className="h-4 w-4" />
						)}
					</Button>
				</div>
			</div>
		</div>
	);
}
