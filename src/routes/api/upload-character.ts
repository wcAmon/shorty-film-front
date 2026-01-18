import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { proxyToBackend } from "@/lib/backend-proxy";

export const Route = createFileRoute("/api/upload-character")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as { imageBase64: string };
					const { imageBase64 } = body;

					if (!imageBase64) {
						return Response.json(
							{ success: false, error: "Image data is required" },
							{ status: 400 },
						);
					}

					// Proxy to backend
					return proxyToBackend("/api/generation/upload/character", {
						method: "POST",
						body: {
							imageBase64,
							ownerId: user.id,
						},
					});
				} catch (err) {
					console.error("[upload-character] Error:", err);

					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to upload character image",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
