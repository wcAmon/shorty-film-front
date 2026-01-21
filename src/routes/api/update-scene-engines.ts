import { createFileRoute } from "@tanstack/react-router";
import { getSceneById, updateScene, verifySceneOwnership } from "@/db/queries";
import { requireAuth } from "@/lib/auth-middleware";

interface UpdateSceneEnginesResponse {
	success: boolean;
	error?: string;
}

export const Route = createFileRoute("/api/update-scene-engines")({
	server: {
		handlers: {
			// POST: Update scene engine settings (imageEngine, videoEngine, avatarEngine)
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as {
						sceneId: string;
						imageEngine?: string;
						videoEngine?: string;
						avatarEngine?: string | null;
					};
					const { sceneId, imageEngine, videoEngine, avatarEngine } = body;

					if (!sceneId) {
						return Response.json(
							{ success: false, error: "Scene ID is required" },
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

					// Build update object with only provided fields
					const updates: Record<string, string | null> = {};
					if (imageEngine !== undefined) updates.imageEngine = imageEngine;
					if (videoEngine !== undefined) updates.videoEngine = videoEngine;
					if (avatarEngine !== undefined) updates.avatarEngine = avatarEngine;

					// Update the scene engine settings
					if (Object.keys(updates).length > 0) {
						await updateScene(sceneId, updates);
						console.log(
							`[update-scene-engines] Updated engine settings for scene ${sceneId}:`,
							updates,
						);
					}

					return Response.json({ success: true } as UpdateSceneEnginesResponse);
				} catch (err) {
					console.error("[update-scene-engines] POST error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to update engine settings",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
