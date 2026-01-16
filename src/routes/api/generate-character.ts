import { fal } from "@fal-ai/client";
import { createFileRoute } from "@tanstack/react-router";
import OpenAI, { toFile } from "openai";
import type Sharp from "sharp";
import { generateImageId } from "@/db";

// Dynamically import sharp to avoid Vite SSR issues with native modules
const getSharp = async (): Promise<typeof Sharp> => {
	const sharpModule = await import("sharp");
	return sharpModule.default;
};
import {
	createImage,
	updateImage,
	getStoryById,
	updateStory,
} from "@/db/queries";
import { uploadImage } from "@/lib/supabase-storage";
import type { ImageType } from "@/db/schema";
import {
	type ImageStyle,
	getCharacterStyleBlock,
} from "@/lib/style-prompts";

function isOpenAISafetyRejection(
	err: InstanceType<typeof OpenAI.APIError>,
): boolean {
	const message = err.message?.toLowerCase() ?? "";
	const code = (err as unknown as { error?: { code?: string } }).error?.code;
	return (
		code === "content_policy_violation" ||
		message.includes("rejected by the safety system") ||
		message.includes("safety system") ||
		message.includes("content policy")
	);
}

// Initialize OpenAI client with API key from environment variables
const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

// Image engine type
type ImageEngine = "gpt-image" | "flux-pro";

// FAL queue status type
interface FalQueueStatus {
	status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
}

// FAL image result type
interface FalImageResult {
	images?: Array<{ url?: string }>;
	data?: {
		images?: Array<{ url?: string }>;
	};
}

export const Route = createFileRoute("/api/generate-character")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = (await request.json()) as {
						prompt: string;
						storyId: string;
						imageEngine?: ImageEngine;
						imageStyle?: ImageStyle;
						aspectRatio?: "9:16" | "16:9";
						person?: "person1" | "person2"; // For podcast42
					};
					const { prompt, storyId, imageEngine = "gpt-image", aspectRatio = "9:16", person } = body;

					console.log(`[generate-character] Received request: storyId=${storyId}, imageEngine=${imageEngine}, aspectRatio=${aspectRatio}, person=${person}`);

					// Validate storyId
					if (!storyId?.trim()) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
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

					// Validate and normalize imageStyle
					const imageStyle: ImageStyle =
						body.imageStyle === "comic"
							? "comic"
							: body.imageStyle === "low-poly"
								? "low-poly"
								: body.imageStyle === "japanese-anime"
									? "japanese-anime"
									: body.imageStyle === "clay"
										? "clay"
										: "cinematic";

					// Validate input is not empty
					if (!prompt?.trim()) {
						return Response.json(
							{ success: false, error: "Character prompt cannot be empty" },
							{ status: 400 },
						);
					}

					// Determine image type
					const imageType: ImageType = person === "person1"
						? "person1"
						: person === "person2"
							? "person2"
							: "character";

					// Step 1: Create image record with status "generating"
					const imageId = generateImageId();
					await createImage({
						id: imageId,
						storyId,
						sceneId: null, // Character images are not scene-specific
						prompt,
						imageType,
						status: "generating",
					});

					console.log(`[generate-character] Created image record: ${imageId}`);

					// Helper function to save image and return response
					const saveImageAndRespond = async (
						jpegBuffer: Buffer,
						additionalData: { fileId?: string; falImageUrl?: string } = {},
					) => {
						// Upload to Supabase Storage using imageType as sceneId
						const imageUrl = await uploadImage(storyId, imageType, jpegBuffer, "jpg");

						console.log(`[generate-character] Uploaded to Supabase: ${imageUrl}`);

						// Update image record with URL and status "completed"
						await updateImage(imageId, {
							imageUrl,
							status: "completed",
						});

						// Update story with the character image ID
						// For aistory: character image goes to person1ImageId
						// For podcast42: person1/person2 images go to respective fields
						if (imageType === "character" || imageType === "person1") {
							await updateStory(storyId, { person1ImageId: imageId });
						} else if (imageType === "person2") {
							await updateStory(storyId, { person2ImageId: imageId });
						}

						console.log(`[generate-character] Image generation completed: ${imageId}, updated story.${imageType === "person2" ? "person2ImageId" : "person1ImageId"}`);

						return Response.json({
							success: true,
							imageId,
							imageUrl,
							...(additionalData.fileId && { fileId: additionalData.fileId }),
							...(additionalData.falImageUrl && { falImageUrl: additionalData.falImageUrl }),
						});
					};

					// Helper function to handle errors
					const handleError = async (error: string, statusCode = 500) => {
						await updateImage(imageId, { status: "ready" }); // Reset to ready on failure
						return Response.json(
							{ success: false, error },
							{ status: statusCode },
						);
					};

					// Get style block from shared style definitions
					const styleBlock = getCharacterStyleBlock(imageStyle);

					// Construct AI image generation prompt with additional requirements
					const formatDescription = aspectRatio === "16:9"
						? "16:9 horizontal landscape format, 720p resolution"
						: "9:16 vertical format";
					const enhancedPrompt = `${prompt}

Additional requirements:
- Generate a clear, high-quality frontal face and upper body portrait
- The background should be simple and not distract from the character
${styleBlock}- ${formatDescription}, suitable for video content`;

					// ============================================================================
					// FLUX PRO PATH (text-to-image uses v1.1)
					// ============================================================================
					if (imageEngine === "flux-pro") {
						// Character generation always uses text-to-image (flux-pro/v1.1)
						const fluxEndpoint = "fal-ai/flux-pro/v1.1";

						console.log(
							`[generate-character] Using Flux Pro v1.1 (${fluxEndpoint})`,
						);

						// Configure FAL client
						fal.config({
							credentials: process.env.FAL_API_KEY,
						});

						// Submit to FAL queue
						const { request_id } = await fal.queue.submit(fluxEndpoint, {
							input: {
								prompt: enhancedPrompt,
								aspect_ratio: aspectRatio,
								safety_tolerance: "5",
							},
						});

						console.log(
							`[generate-character] ${imageEngine} job submitted with request_id: ${request_id}`,
						);

						// Poll for completion
						const pollInterval = 2000; // 2 seconds
						const maxAttempts = 60; // 2 minutes max
						let attempts = 0;

						while (attempts < maxAttempts) {
							await new Promise((resolve) => setTimeout(resolve, pollInterval));
							attempts++;

							const status = (await fal.queue.status(fluxEndpoint, {
								requestId: request_id,
								logs: false,
							})) as FalQueueStatus;

							console.log(
								`[generate-character] ${imageEngine} status: ${status.status}`,
							);

							if (status.status === "FAILED") {
								return handleError(`${imageEngine} image generation failed`);
							}

							if (status.status === "COMPLETED") {
								// Get the result
								const result = (await fal.queue.result(fluxEndpoint, {
									requestId: request_id,
								})) as FalImageResult;

								// Extract image URL from result
								const resultImageUrl =
									result.images?.[0]?.url || result.data?.images?.[0]?.url;

								if (!resultImageUrl) {
									console.error(
										`[generate-character] No image URL in ${imageEngine} result:`,
										result,
									);
									return handleError(`No image URL returned from ${imageEngine}`);
								}

								// Download image and convert to base64
								const imageResponse = await fetch(resultImageUrl);
								const arrayBuffer = await imageResponse.arrayBuffer();
								const imageBuffer = Buffer.from(arrayBuffer);

								// For 16:9 (podcast42), resize to exactly 1280x720
								// FAL returns ~1024x768, so we use cover to crop and scale
								const sharp = await getSharp();
								let processedBuffer: Buffer;
								if (aspectRatio === "16:9") {
									processedBuffer = await sharp(imageBuffer)
										.resize(1280, 720, { fit: "cover" })
										.jpeg({ quality: 85 })
										.toBuffer();
									console.log(`[generate-character] Resized to 1280x720 for podcast42`);
								} else {
									processedBuffer = await sharp(imageBuffer)
										.jpeg({ quality: 85 })
										.toBuffer();
								}

								// Upload resized image to FAL storage for character reference in scene generation
								const imageBlob = new Blob([processedBuffer], {
									type: "image/jpeg",
								});
								const falImageUrl = await fal.storage.upload(imageBlob);

								console.log(
									`[generate-character] ${imageEngine} completed. FAL storage URL: ${falImageUrl}`,
								);

								return saveImageAndRespond(processedBuffer, { falImageUrl });
							}

							// Continue polling if IN_QUEUE or IN_PROGRESS
						}

						// Timeout
						return handleError(`${imageEngine} image generation timed out`);
					}

					// ============================================================================
					// GPT IMAGE PATH (Default)
					// ============================================================================
					console.log("[generate-character] Using GPT Image engine");

					// Determine image size based on aspect ratio
					// 9:16 = 1024x1536 (portrait), 16:9 = 1536x1024 (landscape)
					const imageSize = aspectRatio === "16:9" ? "1536x1024" : "1024x1536";

					// Call OpenAI image generation API
					const response = await openai.images.generate({
						model: "gpt-image-1.5",
						prompt: enhancedPrompt,
						n: 1,
						size: imageSize as "1024x1536" | "1536x1024",
						quality: "low",
					});

					// Check if response contains image data
					if (!response.data || response.data.length === 0) {
						return handleError("No image data returned from OpenAI");
					}

					const imageData = response.data[0];

					// gpt-image-1.5 returns URL format, needs conversion to base64
					let base64: string | undefined;

					if (imageData.url) {
						// Fetch image from URL and convert to base64
						const imageResponse = await fetch(imageData.url);
						const arrayBuffer = await imageResponse.arrayBuffer();
						base64 = Buffer.from(arrayBuffer).toString("base64");
					} else if (imageData.b64_json) {
						// If b64_json format is supported (DALL-E 2)
						base64 = imageData.b64_json;
					}

					if (base64) {
						// Convert PNG to JPEG for smaller payload size (PNG 5MB+ -> JPEG ~500KB)
						const pngBuffer = Buffer.from(base64, "base64");
						const sharp = await getSharp();
						const jpegBuffer = await sharp(pngBuffer)
							.jpeg({ quality: 85 })
							.toBuffer();

						// Upload original PNG to OpenAI Files (better quality for AI reference)
						const imageFile = await toFile(pngBuffer, "character.png", {
							type: "image/png",
						});

						const uploadedFile = await openai.files.create({
							file: imageFile,
							purpose: "vision",
						});

						console.log(`[generate-character] Uploaded to OpenAI Files: ${uploadedFile.id}`);

						return saveImageAndRespond(jpegBuffer, { fileId: uploadedFile.id });
					}

					return handleError("No image data returned from OpenAI");
				} catch (err) {
					// Handle OpenAI API errors
					console.error("OpenAI API error:", err);

					if (err instanceof OpenAI.APIError) {
						if (isOpenAISafetyRejection(err)) {
							return Response.json(
								{
									success: false,
									error:
										"OpenAI rejected this image prompt due to safety/policy filters. Remove references to specific artists/franchises/brands, real people, minors, or sexual content and try again.",
								},
								{ status: 400 },
							);
						}

						return Response.json(
							{ success: false, error: `OpenAI API error: ${err.message}` },
							{ status: 500 },
						);
					}

					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to generate character image",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
