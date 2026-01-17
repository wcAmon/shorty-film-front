import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { getImageById, getVideoById, getAudioById } from "@/db/queries";

/**
 * API endpoint to get media status by ID
 * Used for polling when user returns to scene editor with generating media
 */
export const Route = createFileRoute("/api/get-media-status")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				// Require authentication
				const { error: authError } = await requireAuth(request);
				if (authError) return authError;

				const url = new URL(request.url);
				const mediaType = url.searchParams.get("type"); // 'image' | 'video' | 'audio'
				const mediaId = url.searchParams.get("mediaId");

				if (!mediaType || !mediaId) {
					return Response.json(
						{ success: false, error: "Missing type or mediaId parameter" },
						{ status: 400 },
					);
				}

				try {
					let media: { status: string; imageUrl?: string | null; videoUrl?: string | null; audioUrl?: string | null; duration?: number | null } | undefined;

					switch (mediaType) {
						case "image": {
							const image = await getImageById(mediaId);
							if (image) {
								media = {
									status: image.status,
									imageUrl: image.imageUrl,
								};
							}
							break;
						}
						case "video": {
							const video = await getVideoById(mediaId);
							if (video) {
								media = {
									status: video.status,
									videoUrl: video.videoUrl,
									duration: video.duration,
								};
							}
							break;
						}
						case "audio": {
							const audio = await getAudioById(mediaId);
							if (audio) {
								media = {
									status: audio.status,
									audioUrl: audio.audioUrl,
									duration: audio.duration,
								};
							}
							break;
						}
						default:
							return Response.json(
								{ success: false, error: "Invalid media type" },
								{ status: 400 },
							);
					}

					if (!media) {
						return Response.json(
							{ success: false, error: "Media not found" },
							{ status: 404 },
						);
					}

					return Response.json({
						success: true,
						mediaId,
						mediaType,
						...media,
					});
				} catch (err) {
					console.error("[get-media-status] Error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error ? err.message : "Failed to get media status",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
