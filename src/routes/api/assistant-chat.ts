import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { isBackendConfigured, proxyToBackend } from "@/lib/backend-proxy";

export interface ChatMessage {
	role: "user" | "assistant";
	content: string;
}

export interface ChatRequest {
	storyId: string | null;
	messages: ChatMessage[];
	systemPrompt: string;
}

export interface ToolCallResult {
	name: string;
	arguments: Record<string, unknown>;
	result: unknown;
}

export interface ChatResponse {
	response: string;
	toolCalls?: ToolCallResult[];
}

export const Route = createFileRoute("/api/assistant-chat")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				// Require authentication
				const { user, error } = await requireAuth(request);
				if (error) return error;

				// Check if backend is configured
				if (!isBackendConfigured()) {
					return Response.json(
						{
							success: false,
							error: "Backend not configured",
						},
						{ status: 503 },
					);
				}

				try {
					const body = (await request.json()) as ChatRequest;

					// Validate messages
					if (!body.messages || body.messages.length === 0) {
						return Response.json(
							{ success: false, error: "Messages cannot be empty" },
							{ status: 400 },
						);
					}

					// Proxy to backend with owner ID
					return proxyToBackend("/api/assistant/chat", {
						method: "POST",
						body: {
							ownerId: user.id,
							storyId: body.storyId,
							messages: body.messages,
							systemPrompt: body.systemPrompt,
						},
					});
				} catch (err) {
					console.error("[assistant-chat] Error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error ? err.message : "Failed to send message",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
