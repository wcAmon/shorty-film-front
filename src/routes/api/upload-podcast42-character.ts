import { fal } from "@fal-ai/client";
import { createFileRoute } from "@tanstack/react-router";
import { generateImageId } from "@/db";
import {
	createImage,
	updateImage,
	getStoryById,
} from "@/db/queries";
import { uploadImage } from "@/lib/supabase-storage";
import type { ImageType } from "@/db/schema";

export const Route = createFileRoute("/api/upload-podcast42-character")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = (await request.json()) as {
						imageBase64: string;
						person: "person1" | "person2";
						storyId: string;
					};
					const { imageBase64, person, storyId } = body;

					// Validate input
					if (!imageBase64) {
						return Response.json(
							{ success: false, error: "Image data is required" },
							{ status: 400 },
						);
					}
					if (!storyId) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}
					if (!person) {
						return Response.json(
							{ success: false, error: "Person is required" },
							{ status: 400 },
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

					// Convert base64 to buffer
					const imageBuffer = Buffer.from(imageBase64, "base64");

					// Determine image type
					const imageType: ImageType = person;

					// Create image record with status "generating"
					const imageId = generateImageId();
					await createImage({
						id: imageId,
						storyId,
						sceneId: null, // Character images are not scene-specific
						prompt: `Uploaded ${person} character image`,
						imageType,
						status: "generating",
					});

					console.log(`[upload-podcast42-character] Created image record: ${imageId}`);

					// Upload to Supabase Storage
					const supabaseImageUrl = await uploadImage(storyId, imageType, imageBuffer, "jpg");

					console.log(`[upload-podcast42-character] Uploaded to Supabase: ${supabaseImageUrl}`);

					// Configure FAL client
					fal.config({
						credentials: process.env.FAL_API_KEY,
					});

					// Upload to FAL storage for OmniHuman
					const imageBlob = new Blob([imageBuffer], { type: "image/jpeg" });
					const falImageUrl = await fal.storage.upload(imageBlob);

					console.log(
						`[upload-podcast42-character] Uploaded to FAL storage: ${falImageUrl}`,
					);

					// Update image record with URL and status "completed"
					await updateImage(imageId, {
						imageUrl: supabaseImageUrl,
						status: "completed",
					});

					console.log(`[upload-podcast42-character] Image upload completed: ${imageId}`);

					return Response.json({
						success: true,
						imageId,
						imageUrl: supabaseImageUrl,
						falImageUrl, // FAL storage URL for video generation
					});
				} catch (err) {
					console.error("[upload-podcast42-character] Error:", err);

					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to upload character image",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
