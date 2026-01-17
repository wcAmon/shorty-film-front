import { createFileRoute } from "@tanstack/react-router";
import { getSceneById, updateScene, verifySceneOwnership } from "@/db/queries";
import { requireAuth } from "@/lib/auth-middleware";

interface UpdateSceneCaptionResponse {
	success: boolean;
	error?: string;
}

export const Route = createFileRoute("/api/update-scene-caption")({
	server: {
		handlers: {
			// POST: Update scene caption
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as {
						sceneId: string;
						caption: string;
					};
					const { sceneId, caption } = body;

					if (!sceneId) {
						return Response.json(
							{ success: false, error: "Scene ID is required" },
							{ status: 400 },
						);
					}

					if (caption === undefined || caption === null) {
						return Response.json(
							{ success: false, error: "Caption is required" },
							{ status: 400 },
						);
					}

					// Verify user owns this scene
					const isOwner = await verifySceneOwnership(sceneId, user.id);
					if (!isOwner) {
						return Response.json(
							{ success: false, error: "Scene not found" },
							{ status: 404 },
						);
					}

					// Verify scene exists
					const scene = await getSceneById(sceneId);
					if (!scene) {
						return Response.json(
							{ success: false, error: "Scene not found" },
							{ status: 404 },
						);
					}

					// Update the scene caption
					await updateScene(sceneId, { caption });

					console.log(
						`[update-scene-caption] Updated caption for scene ${sceneId}`,
					);

					return Response.json({ success: true } as UpdateSceneCaptionResponse);
				} catch (err) {
					console.error("[update-scene-caption] POST error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error ? err.message : "Failed to update caption",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
