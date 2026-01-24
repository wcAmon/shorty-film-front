import { createFileRoute } from "@tanstack/react-router";
import {
	getStoryById,
	updateStory,
	verifyStoryOwnership,
} from "@/db/queries";
import type { SubtitleSettingsJson } from "@/db/schema";
import { requireAuth } from "@/lib/auth-middleware";

interface GetSubtitleSettingsResponse {
	success: boolean;
	settings?: SubtitleSettingsJson | null;
	error?: string;
}

interface UpdateSubtitleSettingsResponse {
	success: boolean;
	error?: string;
}

export const Route = createFileRoute("/api/subtitle-settings")({
	server: {
		handlers: {
			// GET: Get subtitle settings for a story
			GET: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const url = new URL(request.url);
					const storyId = url.searchParams.get("storyId");

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

					// Get story with subtitle settings
					const story = await getStoryById(storyId);
					if (!story) {
						return Response.json(
							{ success: false, error: "Story not found" },
							{ status: 404 },
						);
					}

					return Response.json({
						success: true,
						settings: story.subtitleSettings,
					} as GetSubtitleSettingsResponse);
				} catch (err) {
					console.error("[subtitle-settings] GET error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to get subtitle settings",
						},
						{ status: 500 },
					);
				}
			},

			// POST: Update subtitle settings for a story
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as {
						storyId: string;
						settings: SubtitleSettingsJson;
					};
					const { storyId, settings } = body;

					if (!storyId) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}

					if (!settings) {
						return Response.json(
							{ success: false, error: "Settings are required" },
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

					// Update the subtitle settings
					await updateStory(storyId, { subtitleSettings: settings });
					console.log(
						`[subtitle-settings] Updated subtitle settings for story ${storyId}`,
					);

					return Response.json({
						success: true,
					} as UpdateSubtitleSettingsResponse);
				} catch (err) {
					console.error("[subtitle-settings] POST error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to update subtitle settings",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
