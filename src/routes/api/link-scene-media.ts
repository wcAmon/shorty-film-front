import { createFileRoute } from "@tanstack/react-router";
import {
	getImageById,
	getVideoById,
	updateSceneImage,
	updateSceneVideo,
	verifySceneOwnership,
} from "@/db/queries";
import { requireAuth } from "@/lib/auth-middleware";

interface LinkSceneMediaResponse {
	success: boolean;
	imageUrl?: string;
	videoUrl?: string;
	error?: string;
}

export const Route = createFileRoute("/api/link-scene-media")({
	server: {
		handlers: {
			// POST: Link an existing image or video to a scene
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as {
						sceneId: string;
						imageId?: string;
						videoId?: string;
					};
					const { sceneId, imageId, videoId } = body;

					if (!sceneId) {
						return Response.json(
							{ success: false, error: "Scene ID is required" },
							{ status: 400 },
						);
					}

					if (!imageId && !videoId) {
						return Response.json(
							{ success: false, error: "Either imageId or videoId is required" },
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

					const response: LinkSceneMediaResponse = { success: true };

					// Link image if provided
					if (imageId) {
						const image = await getImageById(imageId);
						if (!image) {
							return Response.json(
								{ success: false, error: "Image not found" },
								{ status: 404 },
							);
						}

						// Verify user owns this image
						if (image.ownerId !== user.id) {
							return Response.json(
								{ success: false, error: "Image not found" },
								{ status: 404 },
							);
						}

						// Link image to scene (orphans old image if exists)
						await updateSceneImage(sceneId, imageId, true);
						response.imageUrl = image.imageUrl ?? undefined;
						console.log(
							`[link-scene-media] Linked image ${imageId} to scene ${sceneId}`,
						);
					}

					// Link video if provided
					if (videoId) {
						const video = await getVideoById(videoId);
						if (!video) {
							return Response.json(
								{ success: false, error: "Video not found" },
								{ status: 404 },
							);
						}

						// Verify user owns this video
						if (video.ownerId !== user.id) {
							return Response.json(
								{ success: false, error: "Video not found" },
								{ status: 404 },
							);
						}

						// Link video to scene (orphans old video if exists)
						await updateSceneVideo(sceneId, videoId, true);
						response.videoUrl = video.videoUrl ?? undefined;
						console.log(
							`[link-scene-media] Linked video ${videoId} to scene ${sceneId}`,
						);
					}

					return Response.json(response);
				} catch (err) {
					console.error("[link-scene-media] POST error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to link media to scene",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
