import { createFileRoute } from "@tanstack/react-router";
import { getSceneById, updateScene, verifySceneOwnership } from "@/db/queries";
import { requireAuth } from "@/lib/auth-middleware";

interface UpdateSceneVoiceResponse {
	success: boolean;
	error?: string;
}

export const Route = createFileRoute("/api/update-scene-voice")({
	server: {
		handlers: {
			// POST: Update scene voice settings (voiceId, voiceSpeed)
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as {
						sceneId: string;
						voiceId?: string;
						voiceSpeed?: number;
					};
					const { sceneId, voiceId, voiceSpeed } = body;

					if (!sceneId) {
						return Response.json(
							{ success: false, error: "Scene ID is required" },
							{ status: 400 },
						);
					}

					// Validate voiceSpeed if provided
					if (voiceSpeed !== undefined) {
						if (voiceSpeed < 0.7 || voiceSpeed > 1.2) {
							return Response.json(
								{
									success: false,
									error: "Voice speed must be between 0.7 and 1.2",
								},
								{ status: 400 },
							);
						}
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
					const updates: Record<string, string | number> = {};
					if (voiceId !== undefined) updates.voiceId = voiceId;
					if (voiceSpeed !== undefined) updates.voiceSpeed = voiceSpeed;

					// Update the scene voice settings
					if (Object.keys(updates).length > 0) {
						await updateScene(sceneId, updates);
						console.log(
							`[update-scene-voice] Updated voice settings for scene ${sceneId}:`,
							updates,
						);
					}

					return Response.json({ success: true } as UpdateSceneVoiceResponse);
				} catch (err) {
					console.error("[update-scene-voice] POST error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to update voice settings",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
