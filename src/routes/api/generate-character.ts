import { fal } from "@fal-ai/client";
import { createFileRoute } from "@tanstack/react-router";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { saveCharacterImage } from "@/lib/cache";
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
					};
					const { prompt, storyId, imageEngine = "gpt-image" } = body;

					// Validate storyId
					if (!storyId?.trim()) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
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

					// Get style block from shared style definitions
					const styleBlock = getCharacterStyleBlock(imageStyle);

					// Construct AI image generation prompt with additional requirements
					const enhancedPrompt = `${prompt}

Additional requirements:
- Generate a clear, high-quality frontal face and upper body portrait
- The background should be simple and not distract from the character
${styleBlock}- 9:16 vertical format, suitable for video content`;

					// ============================================================================
					// FLUX PRO PATH
					// ============================================================================
					if (imageEngine === "flux-pro") {
						console.log(
							"[generate-character] Using Flux Pro text-to-image engine",
						);

						// Configure FAL client
						fal.config({
							credentials: process.env.FAL_API_KEY,
						});

						// Submit to FAL queue (Flux Pro Kontext Text-to-Image)
						const { request_id } = await fal.queue.submit(
							"fal-ai/flux-pro/kontext/text-to-image",
							{
								input: {
									prompt: enhancedPrompt,
									aspect_ratio: "9:16",
									safety_tolerance: "5",
								},
							},
						);

						console.log(
							`[generate-character] Flux Pro job submitted with request_id: ${request_id}`,
						);

						// Poll for completion
						const pollInterval = 2000; // 2 seconds
						const maxAttempts = 60; // 2 minutes max
						let attempts = 0;

						while (attempts < maxAttempts) {
							await new Promise((resolve) => setTimeout(resolve, pollInterval));
							attempts++;

							const status = (await fal.queue.status(
								"fal-ai/flux-pro/kontext/text-to-image",
								{
									requestId: request_id,
									logs: false,
								},
							)) as FalQueueStatus;

							console.log(
								`[generate-character] Flux Pro status: ${status.status}`,
							);

							if (status.status === "FAILED") {
								return Response.json(
									{ success: false, error: "Flux Pro image generation failed" },
									{ status: 500 },
								);
							}

							if (status.status === "COMPLETED") {
								// Get the result
								const result = (await fal.queue.result(
									"fal-ai/flux-pro/kontext/text-to-image",
									{
										requestId: request_id,
									},
								)) as FalImageResult;

								// Extract image URL from result
								const imageUrl =
									result.images?.[0]?.url || result.data?.images?.[0]?.url;

								if (!imageUrl) {
									console.error(
										"[generate-character] No image URL in Flux Pro result:",
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

								// Upload to FAL storage for character reference in scene generation
								const imageBlob = new Blob([imageBuffer], {
									type: "image/png",
								});
								const characterImageUrl = await fal.storage.upload(imageBlob);

								console.log(
									`[generate-character] Flux Pro completed. FAL storage URL: ${characterImageUrl}`,
								);

								// Save to cache with storyId
								const cachedUrl = saveCharacterImage(storyId, jpegBuffer);
								console.log(`[generate-character] Saved to cache: ${cachedUrl}`);

								return Response.json({
									success: true,
									imageBase64: jpegBase64,
									imageUrl: characterImageUrl, // FAL storage URL for character reference
								});
							}

							// Continue polling if IN_QUEUE or IN_PROGRESS
						}

						// Timeout
						return Response.json(
							{ success: false, error: "Flux Pro image generation timed out" },
							{ status: 500 },
						);
					}

					// ============================================================================
					// GPT IMAGE PATH (Default)
					// ============================================================================
					console.log("[generate-character] Using GPT Image engine");

					// Call OpenAI image generation API
					const response = await openai.images.generate({
						model: "gpt-image-1.5",
						prompt: enhancedPrompt,
						n: 1,
						size: "1024x1536",
						quality: "low",
					});

					// Check if response contains image data
					if (!response.data || response.data.length === 0) {
						return Response.json(
							{ success: false, error: "No image data returned from OpenAI" },
							{ status: 500 },
						);
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
						const jpegBuffer = await sharp(pngBuffer)
							.jpeg({ quality: 85 })
							.toBuffer();
						const jpegBase64 = jpegBuffer.toString("base64");

						// Upload original PNG to OpenAI Files (better quality for AI reference)
						const imageFile = await toFile(pngBuffer, "character.png", {
							type: "image/png",
						});

						const uploadedFile = await openai.files.create({
							file: imageFile,
							purpose: "vision",
						});

						// Save to cache with storyId
						const cachedUrl = saveCharacterImage(storyId, jpegBuffer);
						console.log(`[generate-character] Saved to cache: ${cachedUrl}`);

						// Return compressed JPEG to client, but use PNG for OpenAI
						return Response.json({
							success: true,
							imageBase64: jpegBase64,
							fileId: uploadedFile.id,
						});
					}

					return Response.json(
						{ success: false, error: "No image data returned from OpenAI" },
						{ status: 500 },
					);
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
