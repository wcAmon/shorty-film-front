import { fal } from "@fal-ai/client";
import { createFileRoute } from "@tanstack/react-router";
import OpenAI from "openai";
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
	getSceneById,
	updateSceneImage,
} from "@/db/queries";
import { uploadImage } from "@/lib/supabase-storage";

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

export const Route = createFileRoute("/api/generate-scene-image")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = (await request.json()) as {
						prompt: string;
						storyId: string;
						sceneId: string;
						isCharacter: boolean;
						characterFileId?: string;
						characterImageUrl?: string; // FAL storage URL for Flux Pro
						imageEngine?: ImageEngine;
					};
					const {
						prompt,
						storyId,
						sceneId,
						isCharacter,
						characterFileId,
						characterImageUrl,
						imageEngine = "gpt-image",
					} = body;

					// Validate storyId and sceneId
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

					// Verify scene exists
					const scene = await getSceneById(sceneId);
					if (!scene) {
						return Response.json(
							{ success: false, error: "Scene not found" },
							{ status: 404 },
						);
					}

					console.log(
						"[generateSceneImage] Starting with isCharacter:",
						isCharacter,
						"hasCharacterFileId:",
						!!characterFileId,
						"hasCharacterImageUrl:",
						!!characterImageUrl,
						"imageEngine:",
						imageEngine,
						"storyId:",
						storyId,
						"sceneId:",
						sceneId,
					);

					// Validate input is not empty
					if (!prompt?.trim()) {
						return Response.json(
							{ success: false, error: "Scene prompt cannot be empty" },
							{ status: 400 },
						);
					}

					// Step 1: Create image record with status "generating"
					const imageId = generateImageId();
					await createImage({
						id: imageId,
						storyId,
						sceneId,
						prompt,
						imageType: "scene",
						status: "generating",
					});

					console.log(`[generateSceneImage] Created image record: ${imageId}`);

					// Helper function to save image and return response
					const saveImageAndRespond = async (jpegBuffer: Buffer) => {
						// Upload to Supabase Storage
						const imageUrl = await uploadImage(storyId, sceneId, jpegBuffer, "jpg");

						console.log(`[generateSceneImage] Uploaded to Supabase: ${imageUrl}`);

						// Update image record with URL and status "completed"
						await updateImage(imageId, {
							imageUrl,
							status: "completed",
						});

						// Update scene FK reference (orphans old image if exists)
						await updateSceneImage(sceneId, imageId);

						console.log(`[generateSceneImage] Image generation completed: ${imageId}`);

						return Response.json({
							success: true,
							imageId,
							imageUrl,
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

					// ============================================================================
					// FLUX PRO PATH
					// - Text-to-image: uses flux-pro/v1.1
					// - Image-to-image (with character): uses flux-pro/kontext/max
					// ============================================================================
					if (imageEngine === "flux-pro") {
						console.log("[generateSceneImage] Using Flux Pro engine");

						// Configure FAL client
						fal.config({
							credentials: process.env.FAL_API_KEY,
						});

						// Determine which Flux endpoint to use:
						// - Image-to-image (kontext/max): if scene has character AND we have characterImageUrl
						// - Text-to-image (v1.1): otherwise
						const useImageToImage = isCharacter && characterImageUrl;
						const fluxEndpoint = useImageToImage
							? "fal-ai/flux-pro/kontext/max"
							: "fal-ai/flux-pro/v1.1";

						console.log(
							`[generateSceneImage] Flux Pro mode: ${useImageToImage ? "image-to-image (kontext/max)" : "text-to-image (v1.1)"}, endpoint: ${fluxEndpoint}`,
						);

						// Enhanced prompt for scene generation
						let enhancedPrompt = prompt;
						if (isCharacter) {
							enhancedPrompt = `${prompt}. The character must be clearly visible and prominently featured in the scene. Maintain character consistency with the reference image.`;
						}

						// Build FAL input based on endpoint
						const falInput = useImageToImage
							? {
									prompt: enhancedPrompt,
									image_url: characterImageUrl, // Reference image for character consistency
									safety_tolerance: "5",
								}
							: {
									prompt: enhancedPrompt,
									aspect_ratio: "9:16",
									safety_tolerance: "5",
								};

						// Submit to FAL queue
						const { request_id } = await fal.queue.submit(fluxEndpoint, {
							input: falInput,
						});

						console.log(
							`[generateSceneImage] ${imageEngine} job submitted with request_id: ${request_id}`,
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
								`[generateSceneImage] ${imageEngine} status: ${status.status}`,
							);

							if (status.status === "FAILED") {
								return handleError(`${imageEngine} scene image generation failed`);
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
										`[generateSceneImage] No image URL in ${imageEngine} result:`,
										result,
									);
									return handleError(`No image URL returned from ${imageEngine}`);
								}

								// Download image and convert to JPEG
								const imageResponse = await fetch(resultImageUrl);
								const arrayBuffer = await imageResponse.arrayBuffer();
								const imageBuffer = Buffer.from(arrayBuffer);

								const sharp = await getSharp();
								const jpegBuffer = await sharp(imageBuffer)
									.jpeg({ quality: 85 })
									.toBuffer();

								console.log(
									`[generateSceneImage] ${imageEngine} scene image completed`,
								);

								return saveImageAndRespond(jpegBuffer);
							}

							// Continue polling if IN_QUEUE or IN_PROGRESS
						}

						// Timeout
						return handleError(`${imageEngine} scene image generation timed out`);
					}

					// ============================================================================
					// GPT IMAGE PATH (Default)
					// ============================================================================

					// If the scene contains the main character AND we have a file_id reference,
					// use openai.responses.create() with image_generation tool for character consistency
					if (isCharacter && characterFileId) {
						console.log(
							"[generateSceneImage] Using responses.create() with file_id reference:",
							characterFileId,
						);

						// Enhanced prompt for character consistency
						const enhancedPrompt = `Generate a 9:16 vertical scene image: ${prompt}.
The character in this scene must be EXACTLY the same person as shown in the reference image - same face, same facial features, same hair style and color, same clothing. Maintain perfect character consistency.`;

						console.log(
							"[generateSceneImage] Calling OpenAI responses.create() with image_generation tool...",
						);

						// Use responses.create() with image_generation tool
						let response = await openai.responses.create({
							model: "gpt-4o",
							input: [
								{
									role: "user",
									content: [
										{
											type: "input_image",
											file_id: characterFileId,
											detail: "high",
										},
										{
											type: "input_text",
											text: enhancedPrompt,
										},
									],
								},
							],
							tools: [
								{
									type: "image_generation",
									size: "1024x1536",
									quality: "medium",
								},
							],
							tool_choice: {
								type: "allowed_tools",
								mode: "required",
								tools: [
									{
										type: "image_generation",
									},
								],
							},
						});

						console.log(
							"[generateSceneImage] OpenAI responses.create() completed",
						);

						const extractImageBuffer = async (
							resp: typeof response,
						): Promise<Buffer | null> => {
							const sharp = await getSharp();
							for (const item of resp.output) {
								// image_generation_call: result is base64 PNG
								if (item.type === "image_generation_call" && item.result) {
									const pngBuffer = Buffer.from(item.result, "base64");
									const jpegBuffer = await sharp(pngBuffer)
										.jpeg({ quality: 85 })
										.toBuffer();
									return jpegBuffer;
								}

								// Some SDK shapes return message content with output_image
								if (item.type === "message" && item.content) {
									for (const contentItem of item.content) {
										const itemAny = contentItem as unknown as {
											type: string;
											image_url?: { url: string };
										};

										if (
											(itemAny.type === "image" ||
												itemAny.type === "output_image") &&
											itemAny.image_url?.url
										) {
											const imgUrl = itemAny.image_url.url;
											if (imgUrl.startsWith("data:")) {
												const base64Match = imgUrl.match(/base64,(.+)/);
												if (base64Match) {
													const pngBuffer = Buffer.from(
														base64Match[1],
														"base64",
													);
													const jpegBuffer = await sharp(pngBuffer)
														.jpeg({ quality: 85 })
														.toBuffer();
													return jpegBuffer;
												}
											} else {
												const imgResponse = await fetch(imgUrl);
												const arrBuffer = await imgResponse.arrayBuffer();
												const pngBuffer = Buffer.from(arrBuffer);
												const jpegBuffer = await sharp(pngBuffer)
													.jpeg({ quality: 85 })
													.toBuffer();
												return jpegBuffer;
											}
										}
									}
								}
							}
							return null;
						};

						let imageBuffer = await extractImageBuffer(response);

						// If not present yet, poll retrieve a few times (image_generation_call may finalize after initial response)
						for (let attempt = 0; attempt < 4 && !imageBuffer; attempt++) {
							await new Promise((resolve) => setTimeout(resolve, 800));
							response = await openai.responses.retrieve(response.id);
							imageBuffer = await extractImageBuffer(response);
						}

						if (imageBuffer) {
							return saveImageAndRespond(imageBuffer);
						}

						console.log(
							"[generateSceneImage] No image found after polling. Response status:",
							response.status,
						);
						return handleError(
							"No image data returned from OpenAI responses API (image_generation_call missing result)",
						);
					}

					// Standard generation without reference image
					let enhancedPrompt = prompt;
					if (isCharacter) {
						enhancedPrompt = `${prompt}. Ensure the character's face is clearly visible and prominently featured in the scene.`;
					}

					// Call OpenAI image generation API with 9:16 aspect ratio
					const response = await openai.images.generate({
						model: "gpt-image-1.5",
						prompt: enhancedPrompt,
						n: 1,
						size: "1024x1536",
						quality: "medium",
					});

					// Check if response contains image data
					if (!response.data || response.data.length === 0) {
						return handleError("No image data returned from OpenAI");
					}

					const imageData = response.data[0];

					// Handle URL format response
					if (imageData.url) {
						const imageResponse = await fetch(imageData.url);
						const arrayBuffer = await imageResponse.arrayBuffer();
						// Compress PNG to JPEG for smaller payload
						const pngBuffer = Buffer.from(arrayBuffer);
						const sharp = await getSharp();
						const jpegBuffer = await sharp(pngBuffer)
							.jpeg({ quality: 85 })
							.toBuffer();

						return saveImageAndRespond(jpegBuffer);
					}

					// Handle b64_json format response
					if (imageData.b64_json) {
						// Compress PNG to JPEG for smaller payload
						const pngBuffer = Buffer.from(imageData.b64_json, "base64");
						const sharp = await getSharp();
						const jpegBuffer = await sharp(pngBuffer)
							.jpeg({ quality: 85 })
							.toBuffer();

						return saveImageAndRespond(jpegBuffer);
					}

					return handleError("No image data returned from OpenAI");
				} catch (err) {
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
									: "Failed to generate scene image",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
