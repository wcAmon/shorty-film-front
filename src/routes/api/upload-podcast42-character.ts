import { createFileRoute } from "@tanstack/react-router";
import { verifyStoryOwnership } from "@/db/queries";
import { requireAuth } from "@/lib/auth-middleware";
import { proxyToBackend } from "@/lib/backend-proxy";

export const Route = createFileRoute("/api/upload-podcast42-character")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as {
						imageBase64: string;
						person: "person1" | "person2";
						storyId: string;
					};
					const { imageBase64, person, storyId } = body;

					// Validate input
					if (!imageBase64) {
						return Response.json(
							{ success: false, error: "Image data is required" },
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
							{ success: false, error: "Person is required" },
							{ status: 400 },
						);
					}

					// Verify user owns this story
					const isOwner = await verifyStoryOwnership(storyId, user.id);
					if (!isOwner) {
						return Response.json(
							{ success: false, error: "Story not found" },
							{ status: 404 },
						);
					}

					// Proxy to backend
					return proxyToBackend("/api/generation/upload/podcast42-character", {
						method: "POST",
						body: {
							imageBase64,
							storyId,
							person,
							ownerId: user.id,
						},
					});
				} catch (err) {
					console.error("[upload-podcast42-character] Error:", err);

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
