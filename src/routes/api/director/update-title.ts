import { createFileRoute } from "@tanstack/react-router";
import { updateStory, verifyStoryOwnership } from "@/db/queries";
import { requireAuth } from "@/lib/auth-middleware";

interface UpdateTitleResponse {
	success: boolean;
	error?: string;
}

export const Route = createFileRoute("/api/director/update-title")({
	server: {
		handlers: {
			// PUT: Update story title
			PUT: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as {
						storyId: string;
						title: string;
					};
					const { storyId, title } = body;

					if (!storyId) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}

					if (title === undefined) {
						return Response.json(
							{ success: false, error: "Title is required" },
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

					// Update the story title
					await updateStory(storyId, { title });
					console.log(
						`[update-title] Updated title for story ${storyId}: "${title}"`,
					);

					return Response.json({
						success: true,
					} as UpdateTitleResponse);
				} catch (err) {
					console.error("[update-title] PUT error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to update story title",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
