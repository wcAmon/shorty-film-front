import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { isBackendConfigured, proxyToBackend } from "@/lib/backend-proxy";
import type { ImageStyle } from "@/lib/style-prompts";

// Scene data type definition for podcast42
export interface Podcast42Scene {
	speaker: "person1" | "person2";
	caption: string;
}

// Avatar engine type for podcast42 (renamed from videoEngine)
type Podcast42AvatarEngine = "omnihuman" | "aurora";

// Voice ID type
type VoiceId =
	| "PIGsltMj3gFMR34aFDI3" // Jonathan
	| "Z3R5wn05IrDiVCyEkUrK" // Arabella
	| "n1PvBOwxb8X6m7tahp2h" // Michael
	| "ZF6FPAbjXT4488VcRRnw" // Amelia
	| "ICwKbPHDHAM3eal5tHEZ" // Tony
	| "cgLpYGyXZhkyalKZ0xeZ" // Knox
	| "YKrm0N1EAM9Bw27j8kuD"; // Leonidas

// Image engine type (all via FAL AI)
type ImageEngine = "flux-pro" | "gpt-image-1.5" | "nano-banana-pro" | "nano-banana";

export const Route = createFileRoute("/api/podcast42-generate-prompts")({
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
						playScript: string;
						imageStyle?: ImageStyle;
						imageEngine?: ImageEngine;
						llmEngine?: "gpt-4.1" | "claude-opus-4-5";
						person1VoiceId?: VoiceId;
						person2VoiceId?: VoiceId;
						avatarEngine?: Podcast42AvatarEngine;
					};

					// Validate input is not empty
					if (!body.playScript?.trim()) {
						return Response.json(
							{ success: false, error: "Play script cannot be empty" },
							{ status: 400 },
						);
					}

					// Proxy to backend with owner ID
					return proxyToBackend("/api/generation/podcast42/story", {
						method: "POST",
						body: {
							playScript: body.playScript,
							imageStyle: body.imageStyle || "cinematic",
							imageEngine: body.imageEngine || "flux-pro",
							llmEngine: body.llmEngine || "gpt-4.1",
							person1VoiceId: body.person1VoiceId || "PIGsltMj3gFMR34aFDI3",
							person2VoiceId: body.person2VoiceId || "Z3R5wn05IrDiVCyEkUrK",
							avatarEngine: body.avatarEngine || "omnihuman",
							ownerId: user.id,
						},
					});
				} catch (err) {
					console.error("[podcast42-generate-prompts] Error:", err);
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
