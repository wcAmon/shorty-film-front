import { MessageSquare, Send, Loader2, Trash2, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDirectorAssistant } from "@/hooks/use-director-assistant";
import { AssistantMessageBubble } from "./AssistantMessage";
import { AssistantToolCall } from "./AssistantToolCall";

interface DirectorAssistantPanelProps {
	onCollapse: () => void;
}

/**
 * Embedded Director Assistant panel for IDE-style layout.
 * Unlike the floating widget, this is always visible and fills its container.
 */
export function DirectorAssistantPanel({ onCollapse }: DirectorAssistantPanelProps) {
	const {
		messages,
		isLoading,
		isLoadingHistory,
		error,
		inputValue,
		messagesEndRef,
		inputRef,
		clearConversation,
		setInputValue,
		handleSend,
		handleKeyDown,
		handleClearConversation,
	} = useDirectorAssistant();

	return (
		<div className="flex h-full flex-col bg-background">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-purple-500/10 to-pink-500/10 p-3">
				<div className="flex items-center gap-2">
					<MessageSquare className="h-4 w-4 text-purple-400" />
					<span className="text-sm font-semibold text-foreground">
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
		</div>
	);
}
