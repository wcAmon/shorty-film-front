import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { isBackendConfigured, proxyToBackend } from "@/lib/backend-proxy";

export const Route = createFileRoute("/api/generate-sound-effect")({
	server: {
		handlers: {
			// POST: Submit a new sound effect generation job
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

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
						storyId: string;
						sceneId: string;
						prompt: string;
						durationSeconds?: number;
						promptInfluence?: number;
					};

					// Proxy to backend with owner ID
					return proxyToBackend("/api/generation/sound-effect", {
						method: "POST",
						body: {
							...body,
							ownerId: user.id,
						},
					});
				} catch (err) {
					console.error("[generate-sound-effect] Submit error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to submit sound effect job",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
