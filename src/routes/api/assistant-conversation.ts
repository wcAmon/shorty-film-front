import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { isBackendConfigured } from "@/lib/backend-proxy";

export interface ConversationMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	toolResults?: Array<{
		name: string;
		arguments: Record<string, unknown>;
		result: unknown;
	}>;
	timestamp: number;
}

export interface GetConversationResponse {
	success: boolean;
	messages: ConversationMessage[];
	error?: string;
}

export interface SaveConversationResponse {
	success: boolean;
	error?: string;
}

export const Route = createFileRoute("/api/assistant-conversation")({
	server: {
		handlers: {
			// GET: Load conversation history
			GET: async ({ request }) => {
				const { user, error } = await requireAuth(request);
				if (error) return error;

				if (!isBackendConfigured()) {
					return Response.json(
						{ success: false, error: "Backend not configured" },
						{ status: 503 },
					);
				}

				const url = new URL(request.url);
				const storyId = url.searchParams.get("storyId");

				if (!storyId) {
					return Response.json(
						{ success: false, error: "storyId is required" },
						{ status: 400 },
					);
				}

				try {
					const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";
					const serverSecret = process.env.SERVER_SECRET;

					const response = await fetch(
						`${backendUrl}/api/assistant/conversation?storyId=${storyId}&ownerId=${user.id}`,
						{
							method: "GET",
							headers: {
								"x-server-secret": serverSecret || "",
							},
						},
					);

					const result = await response.json();
					return Response.json(result);
				} catch (err) {
					console.error("[assistant-conversation] GET error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to load conversation",
						},
						{ status: 500 },
					);
				}
			},

			// PUT: Save conversation history
			PUT: async ({ request }) => {
				const { user, error } = await requireAuth(request);
				if (error) return error;

				if (!isBackendConfigured()) {
					return Response.json(
						{ success: false, error: "Backend not configured" },
						{ status: 503 },
					);
				}

				try {
					const body = (await request.json()) as {
						storyId: string;
						messages: ConversationMessage[];
					};

					if (!body.storyId) {
						return Response.json(
							{ success: false, error: "storyId is required" },
							{ status: 400 },
						);
					}

					const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";
					const serverSecret = process.env.SERVER_SECRET;

					const response = await fetch(
						`${backendUrl}/api/assistant/conversation`,
						{
							method: "PUT",
							headers: {
								"Content-Type": "application/json",
								"x-server-secret": serverSecret || "",
							},
							body: JSON.stringify({
								storyId: body.storyId,
								ownerId: user.id,
								messages: body.messages,
							}),
						},
					);

					const result = await response.json();
					return Response.json(result);
				} catch (err) {
					console.error("[assistant-conversation] PUT error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to save conversation",
						},
						{ status: 500 },
					);
				}
			},

			// DELETE: Clear conversation history
			DELETE: async ({ request }) => {
				const { user, error } = await requireAuth(request);
				if (error) return error;

				if (!isBackendConfigured()) {
					return Response.json(
						{ success: false, error: "Backend not configured" },
						{ status: 503 },
					);
				}

				try {
					const body = (await request.json()) as { storyId: string };

					if (!body.storyId) {
						return Response.json(
							{ success: false, error: "storyId is required" },
							{ status: 400 },
						);
					}

					const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";
					const serverSecret = process.env.SERVER_SECRET;

					const response = await fetch(
						`${backendUrl}/api/assistant/conversation`,
						{
							method: "DELETE",
							headers: {
								"Content-Type": "application/json",
								"x-server-secret": serverSecret || "",
							},
							body: JSON.stringify({
								storyId: body.storyId,
								ownerId: user.id,
							}),
						},
					);

					const result = await response.json();
					return Response.json(result);
				} catch (err) {
					console.error("[assistant-conversation] DELETE error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to clear conversation",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
