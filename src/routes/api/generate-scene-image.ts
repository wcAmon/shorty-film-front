import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { isBackendConfigured, proxyToBackend } from "@/lib/backend-proxy";

export const Route = createFileRoute("/api/generate-scene-image")({
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
						prompt: string;
						storyId: string;
						sceneId: string;
						isCharacter: boolean;
						characterFileId?: string;
						characterImageUrl?: string;
						imageEngine?: "gpt-image" | "flux-pro";
					};

					// Proxy to backend with owner ID
					return proxyToBackend("/api/generation/image", {
						method: "POST",
						body: {
							...body,
							ownerId: user.id,
						},
					});
				} catch (err) {
					console.error("[generate-scene-image] Error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to generate scene image",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
