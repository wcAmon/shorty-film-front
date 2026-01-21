import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";

interface CreateStoryResponse {
	success: boolean;
	storyId?: string;
	error?: string;
}

export const Route = createFileRoute("/api/director/create-story")({
	server: {
		handlers: {
			// POST: Create an empty director-mode story
			POST: async ({ request }) => {
				// Require authentication
				const { user, error: authError } = await requireAuth(request);
				if (authError) return authError;

				try {
					const body = (await request.json()) as {
						imageEngine?: string;
						imageStyle?: string;
						voiceId?: string;
						videoEngine?: string;
					};

					// Call the backend to create the story
					const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";
					const serverSecret = process.env.SERVER_SECRET;

					if (!serverSecret) {
						console.error("[create-story] SERVER_SECRET not configured");
						return Response.json(
							{ success: false, error: "Server configuration error" },
							{ status: 500 },
						);
					}

					const response = await fetch(
						`${backendUrl}/api/generation/director/story`,
						{
							method: "POST",
							headers: {
								"Content-Type": "application/json",
								"x-server-secret": serverSecret,
							},
							body: JSON.stringify({
								ownerId: user.id,
								imageEngine: body.imageEngine,
								imageStyle: body.imageStyle,
								voiceId: body.voiceId,
								videoEngine: body.videoEngine,
							}),
						},
					);

					const result = await response.json();

					if (!result.success) {
						return Response.json(
							{ success: false, error: result.error || "Failed to create story" },
							{ status: 500 },
						);
					}

					console.log(
						`[create-story] Created director-mode story: ${result.storyId}`,
					);

					return Response.json({
						success: true,
						storyId: result.storyId,
					} as CreateStoryResponse);
				} catch (err) {
					console.error("[create-story] POST error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to create director-mode story",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
