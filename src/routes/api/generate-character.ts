import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { isBackendConfigured, proxyToBackend } from "@/lib/backend-proxy";
import type { ImageStyle } from "@/lib/style-prompts";

// Image engine type (all via FAL AI)
type ImageEngine = "flux-pro" | "gpt-image-1.5" | "nano-banana-pro" | "nano-banana" | "flux-schnell" | "flux-schnell-i2i";

export const Route = createFileRoute("/api/generate-character")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				// Check if backend is configured
				if (!isBackendConfigured()) {
					return Response.json(
						{
							success: false,
							error:
								"Backend not configured. Set BACKEND_URL and SERVER_SECRET in environment variables.",
						},
						{ status: 503 },
					);
				}

				try {
					const body = (await request.json()) as {
						prompt: string;
						storyId: string;
						imageEngine?: ImageEngine;
						imageStyle?: ImageStyle;
						aspectRatio?: "9:16" | "16:9";
						person?: "person1" | "person2"; // For podcast42
					};

					// Determine image type based on person parameter
					const imageType =
						body.person === "person1"
							? "person1"
							: body.person === "person2"
								? "person2"
								: "character";

					// Proxy to backend with owner ID and character-specific fields
					return proxyToBackend("/api/generation/image", {
						method: "POST",
						body: {
							prompt: body.prompt,
							storyId: body.storyId,
							sceneId: imageType, // Use imageType as sceneId for character images
							isCharacter: false, // Character generation doesn't use reference image
							imageEngine: body.imageEngine || "flux-pro",
							imageStyle: body.imageStyle,
							aspectRatio: body.aspectRatio || "9:16",
							imageType,
							ownerId: user.id,
						},
					});
				} catch (err) {
					console.error("[generate-character] Error:", err);
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
