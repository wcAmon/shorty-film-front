import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { proxyToBackend } from "@/lib/backend-proxy";

export const Route = createFileRoute("/api/link-character")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as {
						imageId: string;
						storyId: string;
						person: "character" | "person1" | "person2";
					};
					const { imageId, storyId, person } = body;

					if (!imageId) {
						return Response.json(
							{ success: false, error: "Image ID is required" },
							{ status: 400 },
						);
					}

					if (!storyId) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}

					if (!person) {
						return Response.json(
							{ success: false, error: "Person type is required" },
							{ status: 400 },
						);
					}

					// Proxy to backend
					return proxyToBackend("/api/generation/link/character", {
						method: "POST",
						body: {
							imageId,
							storyId,
							person,
							ownerId: user.id,
						},
					});
				} catch (err) {
					console.error("[link-character] Error:", err);

					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to link character image",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
