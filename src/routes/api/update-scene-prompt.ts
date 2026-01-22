import { createFileRoute } from "@tanstack/react-router";
import { getSceneById, updateScene, verifySceneOwnership } from "@/db/queries";
import { requireAuth } from "@/lib/auth-middleware";

interface UpdateScenePromptResponse {
	success: boolean;
	error?: string;
}

export const Route = createFileRoute("/api/update-scene-prompt")({
	server: {
		handlers: {
			// POST: Update scene prompts (image prompt, video prompt)
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as {
						sceneId: string;
						prompt?: string;
						videoPrompt?: string;
						title?: string;
					};
					const { sceneId, prompt, videoPrompt, title } = body;

					if (!sceneId) {
						return Response.json(
							{ success: false, error: "Scene ID is required" },
							{ status: 400 },
						);
					}

					// Need at least one field to update
					if (prompt === undefined && videoPrompt === undefined && title === undefined) {
						return Response.json(
							{
								success: false,
								error:
									"At least one field (prompt, videoPrompt, or title) is required",
							},
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
					const updates: Record<string, string> = {};
					if (prompt !== undefined) updates.prompt = prompt;
					if (videoPrompt !== undefined) updates.videoPrompt = videoPrompt;
					if (title !== undefined) updates.title = title;

					// Update the scene prompts
					if (Object.keys(updates).length > 0) {
						await updateScene(sceneId, updates);
						console.log(
							`[update-scene-prompt] Updated prompts for scene ${sceneId}:`,
							Object.keys(updates),
						);
					}

					return Response.json({ success: true } as UpdateScenePromptResponse);
				} catch (err) {
					console.error("[update-scene-prompt] POST error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to update scene prompts",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
