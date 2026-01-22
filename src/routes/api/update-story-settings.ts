import { createFileRoute } from "@tanstack/react-router";
import { getStoryById, updateStory, verifyStoryOwnership } from "@/db/queries";
import { requireAuth } from "@/lib/auth-middleware";

interface UpdateStorySettingsResponse {
	success: boolean;
	error?: string;
}

export const Route = createFileRoute("/api/update-story-settings")({
	server: {
		handlers: {
			// POST: Update story settings (imageEngine, videoEngine)
			// Note: voiceId is now per-scene, not story-level
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as {
						storyId: string;
						imageEngine?: string;
						videoEngine?: string;
						title?: string;
					};
					const { storyId, imageEngine, videoEngine, title } = body;

					if (!storyId) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
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

					// Verify story exists
					const story = await getStoryById(storyId);
					if (!story) {
						return Response.json(
							{ success: false, error: "Story not found" },
							{ status: 404 },
						);
					}

					// Build update object with only provided fields
					const updates: Record<string, string> = {};
					if (imageEngine !== undefined) updates.imageEngine = imageEngine;
					if (videoEngine !== undefined) updates.videoEngine = videoEngine;
					if (title !== undefined) updates.title = title;

					// Update the story settings
					if (Object.keys(updates).length > 0) {
						await updateStory(storyId, updates);
						console.log(
							`[update-story-settings] Updated settings for story ${storyId}:`,
							updates,
						);
					}

					return Response.json({
						success: true,
					} as UpdateStorySettingsResponse);
				} catch (err) {
					console.error("[update-story-settings] POST error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to update story settings",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
