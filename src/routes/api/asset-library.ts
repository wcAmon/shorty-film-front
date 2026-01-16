import { createFileRoute } from "@tanstack/react-router";
import { getOrphanedImages, getOrphanedVideos } from "@/db/queries";

interface AssetLibraryResponse {
	success: boolean;
	images?: Array<{
		id: string;
		imageUrl: string | null;
		prompt: string;
		imageType: string;
		createdAt: Date | null;
	}>;
	videos?: Array<{
		id: string;
		videoUrl: string | null;
		prompt: string;
		duration: number | null;
		createdAt: Date | null;
	}>;
	error?: string;
}

export const Route = createFileRoute("/api/asset-library")({
	server: {
		handlers: {
			// GET: List orphaned images and videos
			GET: async () => {
				try {
					const [images, videos] = await Promise.all([
						getOrphanedImages(),
						getOrphanedVideos(),
					]);

					return Response.json({
						success: true,
						images: images.map((img) => ({
							id: img.id,
							imageUrl: img.imageUrl,
							prompt: img.prompt,
							imageType: img.imageType,
							createdAt: img.createdAt,
						})),
						videos: videos.map((vid) => ({
							id: vid.id,
							videoUrl: vid.videoUrl,
							prompt: vid.prompt,
							duration: vid.duration,
							createdAt: vid.createdAt,
						})),
					} as AssetLibraryResponse);
				} catch (err) {
					console.error("[asset-library] GET error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error ? err.message : "Failed to get asset library",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
