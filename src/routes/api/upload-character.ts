import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { OpenAI, openai, toFile } from "@/lib/openai-client";

export const Route = createFileRoute("/api/upload-character")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				// Require authentication
				const { error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as { imageBase64: string };
					const { imageBase64 } = body;

					if (!imageBase64) {
						return Response.json(
							{ success: false, error: "Image data is required" },
							{ status: 400 },
						);
					}

					// Convert base64 to file for OpenAI API (supports both JPEG and PNG)
					const imageBuffer = Buffer.from(imageBase64, "base64");
					const imageFile = await toFile(imageBuffer, "character.jpg", {
						type: "image/jpeg",
					});

					// Upload to OpenAI Files
					const uploadedFile = await openai.files.create({
						file: imageFile,
						purpose: "vision",
					});

					return Response.json({
						success: true,
						fileId: uploadedFile.id,
					});
				} catch (err) {
					console.error("OpenAI Files API error:", err);

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
									: "Failed to upload character image",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
