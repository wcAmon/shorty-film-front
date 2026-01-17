import { createFileRoute } from "@tanstack/react-router";
import {
	deleteSceneById,
	getStoryById,
	verifyStoryOwnership,
} from "@/db/queries";
import { requireAuth } from "@/lib/auth-middleware";
import { deleteExportVideo, deleteFromStorage } from "@/lib/supabase-storage";

// Request interface
interface DeleteSceneFilesRequest {
	storyId: string;
	sceneId: string;
}

// Response interface
interface DeleteSceneFilesResponse {
	success: boolean;
	error?: string;
}

export const Route = createFileRoute("/api/podcast42-delete-scene-files")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as DeleteSceneFilesRequest;
					const { storyId, sceneId } = body;

					// Validation
					if (!storyId?.trim()) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}

					if (!sceneId?.trim()) {
						return Response.json(
							{ success: false, error: "Scene ID is required" },
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

					// Verify story exists and is podcast42 type
					const story = await getStoryById(storyId);
					if (!story) {
						return Response.json(
							{ success: false, error: "Story not found" },
							{ status: 404 },
						);
					}

					if (story.type !== "podcast42") {
						return Response.json(
							{
								success: false,
								error: "This API is only for podcast42 stories",
							},
							{ status: 400 },
						);
					}

					console.log(
						`[podcast42-delete-scene-files] Deleting files for story ${storyId}, scene ${sceneId}`,
					);

					// Delete scene files from Supabase Storage
					const audioPath = `audio-${storyId}-${sceneId}.mp3`;
					const videoPath = `video-${storyId}-${sceneId}.mp4`;

					try {
						await deleteFromStorage("audios", audioPath);
					} catch (err) {
						console.log(
							`[podcast42-delete-scene-files] Audio file not found: ${audioPath}`,
						);
					}

					try {
						await deleteFromStorage("videos", videoPath);
					} catch (err) {
						console.log(
							`[podcast42-delete-scene-files] Video file not found: ${videoPath}`,
						);
					}

					// Delete scene from database (will orphan associated media records)
					await deleteSceneById(sceneId);

					// Also delete exported video since it's now outdated
					if (story.exportVideoUrl) {
						try {
							await deleteExportVideo(storyId);
						} catch (err) {
							console.log(
								`[podcast42-delete-scene-files] Export video not found`,
							);
						}
					}

					return Response.json({
						success: true,
					} as DeleteSceneFilesResponse);
				} catch (err) {
					console.error("[podcast42-delete-scene-files] Error:", err);

					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to delete scene files",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
