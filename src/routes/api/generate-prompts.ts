import { createFileRoute } from "@tanstack/react-router";
import type { ImageStyle } from "@/lib/style-prompts";
import { requireAuth } from "@/lib/auth-middleware";
import { isBackendConfigured, proxyToBackend } from "@/lib/backend-proxy";

// Scene data type definition
export interface Scene {
	id: string;
	title: string;
	prompt: string;
	video_prompt: string;
	isCharacter: boolean;
	caption: string;
}

export const Route = createFileRoute("/api/generate-prompts")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				// Require authentication
				const { user, error } = await requireAuth(request);
				if (error) return error;

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
						script: string;
						imageStyle?: ImageStyle;
						imageEngine?: "flux-pro" | "gpt-image-1.5";
						voiceId?: string;
						videoEngine?: string;
					};

					// Validate input is not empty
					if (!body.script?.trim()) {
						return Response.json(
							{ success: false, error: "Narrative script cannot be empty" },
							{ status: 400 },
						);
					}

					// Proxy to backend with owner ID
					return proxyToBackend("/api/generation/story", {
						method: "POST",
						body: {
							script: body.script,
							imageStyle: body.imageStyle || "cinematic",
							imageEngine: body.imageEngine || "flux-pro",
							voiceId: body.voiceId,
							videoEngine: body.videoEngine,
							ownerId: user.id,
						},
					});
				} catch (err) {
					console.error("[generate-prompts] Error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to generate prompts",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
