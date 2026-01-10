import { fal } from "@fal-ai/client";
import { createFileRoute } from "@tanstack/react-router";
import OpenAI from "openai";
import sharp from "sharp";

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
						isCharacter: boolean;
						characterFileId?: string;
						characterImageUrl?: string; // FAL storage URL for Flux Pro
						imageEngine?: ImageEngine;
					};
					const {
						prompt,
						isCharacter,
						characterFileId,
						characterImageUrl,
						imageEngine = "gpt-image",
					} = body;

					console.log(
						"[generateSceneImage] Starting with isCharacter:",
						isCharacter,
						"hasCharacterFileId:",
						!!characterFileId,
						"hasCharacterImageUrl:",
						!!characterImageUrl,
						"imageEngine:",
						imageEngine,
					);

					// Validate input is not empty
					if (!prompt?.trim()) {
						return Response.json(
							{ success: false, error: "Scene prompt cannot be empty" },
							{ status: 400 },
						);
					}

					// ============================================================================
					// FLUX PRO PATH
					// ============================================================================
					if (imageEngine === "flux-pro") {
						console.log("[generateSceneImage] Using Flux Pro engine");

						// Configure FAL client
						fal.config({
							credentials: process.env.FAL_API_KEY,
						});

						// Determine which Flux endpoint to use:
						// - Image-to-Image (kontext): if scene has character AND we have characterImageUrl
						// - Text-to-Image (kontext/text-to-image): otherwise
						const useImageToImage = isCharacter && characterImageUrl;
						const fluxEndpoint = useImageToImage
							? "fal-ai/flux-pro/kontext"
							: "fal-ai/flux-pro/kontext/text-to-image";

						console.log(
							`[generateSceneImage] Flux Pro mode: ${useImageToImage ? "image-to-image" : "text-to-image"}`,
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
								}
							: {
									prompt: enhancedPrompt,
									aspect_ratio: "9:16",
								};

						// Submit to FAL queue
						const { request_id } = await fal.queue.submit(fluxEndpoint, {
							input: falInput,
						});

						console.log(
							`[generateSceneImage] Flux Pro job submitted with request_id: ${request_id}`,
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
								`[generateSceneImage] Flux Pro status: ${status.status}`,
							);

							if (status.status === "FAILED") {
								return Response.json(
									{
										success: false,
										error: "Flux Pro scene image generation failed",
									},
									{ status: 500 },
								);
							}

							if (status.status === "COMPLETED") {
								// Get the result
								const result = (await fal.queue.result(fluxEndpoint, {
									requestId: request_id,
								})) as FalImageResult;

								// Extract image URL from result
								const imageUrl =
									result.images?.[0]?.url || result.data?.images?.[0]?.url;

								if (!imageUrl) {
									console.error(
										"[generateSceneImage] No image URL in Flux Pro result:",
										result,
									);
									return Response.json(
										{
											success: false,
											error: "No image URL returned from Flux Pro",
										},
										{ status: 500 },
									);
								}

								// Download image and convert to base64
								const imageResponse = await fetch(imageUrl);
								const arrayBuffer = await imageResponse.arrayBuffer();
								const imageBuffer = Buffer.from(arrayBuffer);

								// Convert to JPEG for smaller payload
								const jpegBuffer = await sharp(imageBuffer)
									.jpeg({ quality: 85 })
									.toBuffer();
								const jpegBase64 = jpegBuffer.toString("base64");

								console.log(
									"[generateSceneImage] Flux Pro scene image completed",
								);

								return Response.json({
									success: true,
									imageBase64: jpegBase64,
								});
							}

							// Continue polling if IN_QUEUE or IN_PROGRESS
						}

						// Timeout
						return Response.json(
							{
								success: false,
								error: "Flux Pro scene image generation timed out",
							},
							{ status: 500 },
						);
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

						const extractImageBase64 = async (
							resp: typeof response,
						): Promise<string | null> => {
							for (const item of resp.output) {
								// image_generation_call: result is base64 PNG
								if (item.type === "image_generation_call" && item.result) {
									const pngBuffer = Buffer.from(item.result, "base64");
									const jpegBuffer = await sharp(pngBuffer)
										.jpeg({ quality: 85 })
										.toBuffer();
									return jpegBuffer.toString("base64");
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
											const imageUrl = itemAny.image_url.url;
											if (imageUrl.startsWith("data:")) {
												const base64Match = imageUrl.match(/base64,(.+)/);
												if (base64Match) {
													const pngBuffer = Buffer.from(
														base64Match[1],
														"base64",
													);
													const jpegBuffer = await sharp(pngBuffer)
														.jpeg({ quality: 85 })
														.toBuffer();
													return jpegBuffer.toString("base64");
												}
											} else {
												const imageResponse = await fetch(imageUrl);
												const arrayBuffer = await imageResponse.arrayBuffer();
												const pngBuffer = Buffer.from(arrayBuffer);
												const jpegBuffer = await sharp(pngBuffer)
													.jpeg({ quality: 85 })
													.toBuffer();
												return jpegBuffer.toString("base64");
											}
										}
									}
								}
							}
							return null;
						};

						let imageBase64 = await extractImageBase64(response);

						// If not present yet, poll retrieve a few times (image_generation_call may finalize after initial response)
						for (let attempt = 0; attempt < 4 && !imageBase64; attempt++) {
							await new Promise((resolve) => setTimeout(resolve, 800));
							response = await openai.responses.retrieve(response.id);
							imageBase64 = await extractImageBase64(response);
						}

						if (imageBase64) {
							return Response.json({
								success: true,
								imageBase64,
							});
						}

						console.log(
							"[generateSceneImage] No image found after polling. Response status:",
							response.status,
						);
						return Response.json(
							{
								success: false,
								error:
									"No image data returned from OpenAI responses API (image_generation_call missing result)",
							},
							{ status: 500 },
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
						return Response.json(
							{ success: false, error: "No image data returned from OpenAI" },
							{ status: 500 },
						);
					}

					const imageData = response.data[0];

					// Handle URL format response
					if (imageData.url) {
						const imageResponse = await fetch(imageData.url);
						const arrayBuffer = await imageResponse.arrayBuffer();
						// Compress PNG to JPEG for smaller payload
						const pngBuffer = Buffer.from(arrayBuffer);
						const jpegBuffer = await sharp(pngBuffer)
							.jpeg({ quality: 85 })
							.toBuffer();
						const jpegBase64 = jpegBuffer.toString("base64");

						return Response.json({
							success: true,
							imageBase64: jpegBase64,
						});
					}

					// Handle b64_json format response
					if (imageData.b64_json) {
						// Compress PNG to JPEG for smaller payload
						const pngBuffer = Buffer.from(imageData.b64_json, "base64");
						const jpegBuffer = await sharp(pngBuffer)
							.jpeg({ quality: 85 })
							.toBuffer();
						const jpegBase64 = jpegBuffer.toString("base64");

						return Response.json({
							success: true,
							imageBase64: jpegBase64,
						});
					}

					return Response.json(
						{ success: false, error: "No image data returned from OpenAI" },
						{ status: 500 },
					);
				} catch (err) {
					console.error("OpenAI API error:", err);

					if (err instanceof OpenAI.APIError) {
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
