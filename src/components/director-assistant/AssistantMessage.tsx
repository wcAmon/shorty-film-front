import type { AssistantMessage } from "@/stores/director-assistant.store";
import { User, Bot } from "lucide-react";

interface Props {
	message: AssistantMessage;
}

export function AssistantMessageBubble({ message }: Props) {
	const isUser = message.role === "user";

	return (
		<div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
			{!isUser && (
				<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500">
					<Bot className="h-4 w-4 text-white" />
				</div>
			)}

			<div
				className={`max-w-[80%] rounded-2xl px-4 py-2 ${
					isUser
						? "rounded-br-md bg-purple-500/20 text-foreground"
						: "rounded-bl-md bg-muted text-foreground"
				}`}
			>
				<p className="whitespace-pre-wrap text-sm">{message.content}</p>
			</div>

			{isUser && (
				<div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted">
					<User className="h-4 w-4 text-muted-foreground" />
				</div>
			)}
		</div>
	);
}
