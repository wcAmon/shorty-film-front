import { createFileRoute } from "@tanstack/react-router";
import { getUserImages, getUserVideos } from "@/db/queries";
import { requireAuth } from "@/lib/auth-middleware";

interface AssetLibraryResponse {
	success: boolean;
	images?: Array<{
		id: string;
		imageUrl: string | null;
		prompt: string;
		imageType: string;
		storyId: string | null;
		createdAt: Date | null;
	}>;
	videos?: Array<{
		id: string;
		videoUrl: string | null;
		prompt: string;
		duration: number | null;
		storyId: string | null;
		createdAt: Date | null;
	}>;
	error?: string;
}

export const Route = createFileRoute("/api/asset-library")({
	server: {
		handlers: {
			// GET: List all images and videos for authenticated user
			GET: async ({ request }) => {
				// Require authentication
				const { user, error } = await requireAuth(request);
				if (error) return error;

				try {
					// Get ALL user's images and videos (not just orphaned)
					const [images, videos] = await Promise.all([
						getUserImages(user.id),
						getUserVideos(user.id),
					]);

					return Response.json({
						success: true,
						images: images.map((img) => ({
							id: img.id,
							imageUrl: img.imageUrl,
							prompt: img.prompt,
							imageType: img.imageType,
							storyId: img.storyId,
							createdAt: img.createdAt,
						})),
						videos: videos.map((vid) => ({
							id: vid.id,
							videoUrl: vid.videoUrl,
							prompt: vid.prompt,
							duration: vid.duration,
							storyId: vid.storyId,
							createdAt: vid.createdAt,
						})),
					} as AssetLibraryResponse);
				} catch (err) {
					console.error("[asset-library] GET error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to get asset library",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
