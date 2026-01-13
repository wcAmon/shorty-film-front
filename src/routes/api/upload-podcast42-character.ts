import { fal } from "@fal-ai/client";
import { createFileRoute } from "@tanstack/react-router";
import {
	savePerson1Image,
	savePerson2Image,
	loadStoryMetadata,
	saveStoryMetadata,
} from "@/lib/cache";

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

					// Configure FAL client
					fal.config({
						credentials: process.env.FAL_API_KEY,
					});

					// Convert base64 to buffer
					const imageBuffer = Buffer.from(imageBase64, "base64");

					// Save to local cache
					if (person === "person1") {
						savePerson1Image(storyId, imageBuffer);
					} else {
						savePerson2Image(storyId, imageBuffer);
					}
					console.log(`[upload-podcast42-character] Saved ${person} to cache`);

					// Upload to FAL storage for OmniHuman
					const imageBlob = new Blob([imageBuffer], { type: "image/jpeg" });
					const imageUrl = await fal.storage.upload(imageBlob);

					console.log(
						`[upload-podcast42-character] Uploaded to FAL storage: ${imageUrl}`,
					);

					// Update metadata if it exists
					const existingMetadata = loadStoryMetadata(storyId);
					if (existingMetadata) {
						if (person === "person1") {
							existingMetadata.person1ImageUrl = imageUrl;
							existingMetadata.hasPerson1Image = true;
						} else {
							existingMetadata.person2ImageUrl = imageUrl;
							existingMetadata.hasPerson2Image = true;
						}
						saveStoryMetadata(existingMetadata);
					}

					return Response.json({
						success: true,
						imageUrl,
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
