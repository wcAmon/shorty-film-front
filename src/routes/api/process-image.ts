import { createFileRoute } from "@tanstack/react-router";
import sharp from "sharp";
import { requireAuth } from "@/lib/auth-middleware";

type AspectRatio = "9:16" | "16:9" | "1:1";

interface ProcessImageBody {
	sourceUrl?: string; // From asset library URL
	sourceBase64?: string; // From local upload
	targetAspectRatio: AspectRatio;
}

// Target dimensions based on aspect ratio
const DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
	"9:16": { width: 1080, height: 1920 }, // 1080p portrait
	"16:9": { width: 1920, height: 1080 }, // 1080p landscape
	"1:1": { width: 1080, height: 1080 }, // Square
};

export const Route = createFileRoute("/api/process-image")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				// Require authentication
				const { error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as ProcessImageBody;
					const { sourceUrl, sourceBase64, targetAspectRatio } = body;

					// Validate aspect ratio
					if (!targetAspectRatio || !DIMENSIONS[targetAspectRatio]) {
						return Response.json(
							{
								success: false,
								error: "Invalid targetAspectRatio. Must be 9:16, 16:9, or 1:1",
							},
							{ status: 400 },
						);
					}

					// 1. Get image buffer from source
					let imageBuffer: Buffer;

					if (sourceUrl) {
						// Fetch from URL (asset library)
						const response = await fetch(sourceUrl);
						if (!response.ok) {
							return Response.json(
								{ success: false, error: "Failed to fetch image from URL" },
								{ status: 400 },
							);
						}
						imageBuffer = Buffer.from(await response.arrayBuffer());
					} else if (sourceBase64) {
						// Decode from base64 (local upload)
						imageBuffer = Buffer.from(sourceBase64, "base64");
					} else {
						return Response.json(
							{
								success: false,
								error: "Either sourceUrl or sourceBase64 is required",
							},
							{ status: 400 },
						);
					}

					// 2. Get target dimensions
					const { width: targetWidth, height: targetHeight } =
						DIMENSIONS[targetAspectRatio];

					// 3. Process image with Sharp
					// - fit: "cover" will crop the image to fill the target dimensions
					// - position: "center" will crop from the center
					const processedBuffer = await sharp(imageBuffer)
						.resize(targetWidth, targetHeight, {
							fit: "cover",
							position: "center",
						})
						.jpeg({ quality: 85 })
						.toBuffer();

					// 4. Return base64 encoded result
					return Response.json({
						success: true,
						base64: processedBuffer.toString("base64"),
						width: targetWidth,
						height: targetHeight,
					});
				} catch (err) {
					console.error("[process-image] Error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error ? err.message : "Failed to process image",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
