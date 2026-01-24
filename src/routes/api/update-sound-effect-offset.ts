import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { updateScene, verifySceneOwnership } from "@/db/queries";

export const Route = createFileRoute("/api/update-sound-effect-offset")({
	server: {
		handlers: {
			// PUT: Update sound effect offset for a scene
			PUT: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as {
						sceneId: string;
						offset: number;
					};

					const { sceneId, offset } = body;

					if (!sceneId) {
						return Response.json(
							{ success: false, error: "Scene ID is required" },
							{ status: 400 },
						);
					}

					if (typeof offset !== "number") {
						return Response.json(
							{ success: false, error: "Offset must be a number" },
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

					// Update the scene's sound effect offset
					await updateScene(sceneId, { soundEffectOffset: offset });

					console.log(
						`[update-sound-effect-offset] Updated offset for scene ${sceneId} to ${offset}s`,
					);

					return Response.json({ success: true, offset });
				} catch (err) {
					console.error("[update-sound-effect-offset] Error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to update sound effect offset",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
