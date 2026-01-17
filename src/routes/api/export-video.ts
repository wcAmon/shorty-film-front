import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { isBackendConfigured, proxyToBackend } from "@/lib/backend-proxy";

export const Route = createFileRoute("/api/export-video")({
	server: {
		handlers: {
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
					};

					// Proxy to backend with owner ID
					return proxyToBackend("/api/generation/export", {
						method: "POST",
						body: {
							...body,
							ownerId: user.id,
						},
					});
				} catch (err) {
					console.error("[export-video] Submit error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to submit export video job",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
