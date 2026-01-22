import type { AssistantMessage } from "@/stores/aistory-assistant.store";
import { User, Bot } from "lucide-react";
import Markdown from "react-markdown";

interface Props {
	message: AssistantMessage;
}

export function AssistantMessageBubble({ message }: Props) {
	const isUser = message.role === "user";

	return (
		<div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
			{!isUser && (
				<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-blue-500 to-cyan-500">
					<Bot className="h-4 w-4 text-white" />
				</div>
			)}

			<div
				className={`max-w-[80%] rounded-2xl px-4 py-2 ${
					isUser
						? "rounded-br-md bg-blue-500/20 text-foreground"
						: "rounded-bl-md bg-muted text-foreground"
				}`}
			>
				{isUser ? (
					<p className="whitespace-pre-wrap text-sm">{message.content}</p>
				) : (
					<div className="prose prose-sm prose-invert max-w-none text-foreground prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-foreground prose-strong:text-foreground prose-code:text-blue-300 prose-code:bg-blue-500/20 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-black/30 prose-pre:p-2 prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline">
						<Markdown>{message.content}</Markdown>
					</div>
				)}
			</div>

			{isUser && (
				<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted">
					<User className="h-4 w-4 text-muted-foreground" />
				</div>
			)}
		</div>
	);
}
