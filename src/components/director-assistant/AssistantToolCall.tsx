import type { AssistantToolResult } from "@/stores/director-assistant.store";
import {
	Wrench,
	Plus,
	Edit3,
	Trash2,
	User,
	Search,
	Check,
	X,
} from "lucide-react";

interface Props {
	toolResult: AssistantToolResult;
}

const TOOL_ICONS: Record<string, typeof Wrench> = {
	add_scene: Plus,
	update_scene: Edit3,
	delete_scene: Trash2,
	update_character: User,
	web_search: Search,
};

const TOOL_LABELS: Record<string, string> = {
	add_scene: "Added Scene",
	update_scene: "Updated Scene",
	delete_scene: "Deleted Scene",
	update_character: "Updated Character",
	web_search: "Searched Web",
};

export function AssistantToolCall({ toolResult }: Props) {
	const Icon = TOOL_ICONS[toolResult.name] || Wrench;
	const label = TOOL_LABELS[toolResult.name] || toolResult.name;
	const isSuccess =
		toolResult.result &&
		typeof toolResult.result === "object" &&
		"success" in toolResult.result &&
		(toolResult.result as { success: boolean }).success;
	const hasError =
		toolResult.result &&
		typeof toolResult.result === "object" &&
		"error" in toolResult.result;

	return (
		<div
			className={`my-2 ml-10 rounded-lg border px-3 py-2 ${
				hasError
					? "border-red-500/30 bg-red-500/10"
					: "border-emerald-500/30 bg-emerald-500/10"
			}`}
		>
			<div
				className={`flex items-center gap-2 text-xs font-medium ${
					hasError ? "text-red-400" : "text-emerald-400"
				}`}
			>
				<Icon className="h-3 w-3" />
				<span>{label}</span>
				{isSuccess && <Check className="h-3 w-3" />}
				{hasError && <X className="h-3 w-3" />}
			</div>
			{hasError && (
				<p className="mt-1 text-xs text-red-400">
					{(toolResult.result as { error: string }).error}
				</p>
			)}
		</div>
	);
}
