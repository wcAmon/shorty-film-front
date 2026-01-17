import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { isBackendConfigured, proxyToBackend } from "@/lib/backend-proxy";

// Word-level timestamp for caption synchronization (exported for compatibility)
export interface WordTimestamp {
	word: string;
	startTime: number;
	endTime: number;
}

export const Route = createFileRoute("/api/generate-scene-audio")({
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
							error:
								"Backend not configured. Set BACKEND_URL and SERVER_SECRET in environment variables.",
						},
						{ status: 503 },
					);
				}

				try {
					const body = (await request.json()) as {
						caption: string;
						storyId: string;
						sceneId: string;
						voiceId?: string;
					};

					// Proxy to backend with owner ID
					return proxyToBackend("/api/generation/audio", {
						method: "POST",
						body: {
							...body,
							ownerId: user.id,
						},
					});
				} catch (err) {
					console.error("[generate-scene-audio] Error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to generate scene audio",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
