import { createFileRoute } from "@tanstack/react-router";
import { updateScene, verifyStoryOwnership } from "@/db/queries";
import { requireAuth } from "@/lib/auth-middleware";

interface ReorderScenesResponse {
	success: boolean;
	error?: string;
}

export const Route = createFileRoute("/api/reorder-scenes")({
	server: {
		handlers: {
			// POST: Update scene order indices
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as {
						storyId: string;
						sceneOrder: Array<{ sceneId: string; orderIndex: number }>;
					};
					const { storyId, sceneOrder } = body;

					if (!storyId) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}

					if (!sceneOrder || !Array.isArray(sceneOrder) || sceneOrder.length === 0) {
						return Response.json(
							{ success: false, error: "Scene order array is required" },
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

					// Update each scene's orderIndex
					for (const { sceneId, orderIndex } of sceneOrder) {
						await updateScene(sceneId, { orderIndex });
					}

					console.log(
						`[reorder-scenes] Updated order for ${sceneOrder.length} scenes in story ${storyId}`,
					);

					return Response.json({ success: true } as ReorderScenesResponse);
				} catch (err) {
					console.error("[reorder-scenes] POST error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to reorder scenes",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
