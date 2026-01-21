import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { isBackendConfigured, proxyToBackend } from "@/lib/backend-proxy";

export interface VideoPreferences {
	style?: string;
	pacing?: string;
	tonePreferences?: string;
	hookStyle?: string;
	contentFocus?: string[];
	avoidTopics?: string[];
	customNotes?: string;
}

export interface UserPreferencesResponse {
	preferences: {
		videoPreferences: VideoPreferences | null;
		preferenceSummary: string | null;
	} | null;
}

export const Route = createFileRoute("/api/user-preferences")({
	server: {
		handlers: {
			// Get user preferences
			GET: async ({ request }) => {
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
					// Proxy to backend
					return proxyToBackend(`/api/assistant/preferences?ownerId=${user.id}`, {
						method: "GET",
					});
				} catch (err) {
					console.error("[user-preferences] GET Error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to get preferences",
						},
						{ status: 500 },
					);
				}
			},

			// Update user preferences
			PUT: async ({ request }) => {
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
					const body = (await request.json()) as {
						videoPreferences?: VideoPreferences;
						preferenceSummary?: string;
					};

					// Proxy to backend with owner ID
					return proxyToBackend("/api/assistant/preferences", {
						method: "PUT",
						body: {
							ownerId: user.id,
							videoPreferences: body.videoPreferences,
							preferenceSummary: body.preferenceSummary,
						},
					});
				} catch (err) {
					console.error("[user-preferences] PUT Error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to update preferences",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
