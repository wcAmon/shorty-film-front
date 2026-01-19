import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { isBackendConfigured, proxyToBackend } from "@/lib/backend-proxy";

export const Route = createFileRoute("/api/generate-scene-video")({
	server: {
		handlers: {
			// POST: Submit a new video generation job
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
						storyId: string;
						sceneId: string;
						videoPrompt: string;
						imageUrl: string;
						audioUrl: string;
						audioDuration: number;
						imageId: string;
						audioId: string;
						videoEngine?: string;
					};

					// Proxy to backend with owner ID
					return proxyToBackend("/api/generation/video", {
						method: "POST",
						body: {
							...body,
							ownerId: user.id,
						},
					});
				} catch (err) {
					console.error("[generate-scene-video] Submit error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to submit video job",
						},
						{ status: 500 },
					);
				}
			},

			// PUT: Check job status (deprecated - use jobs table monitoring instead)
			// Kept for backwards compatibility
			PUT: async ({ request }) => {
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
						storyId: string;
						sceneId: string;
						jobId?: string;
					};

					// If jobId is provided, get specific job status
					if (body.jobId) {
						return proxyToBackend(`/api/generation/jobs/${body.jobId}`, {
							method: "GET",
						});
					}

					// Otherwise, list jobs for this scene (filter by sceneId in query)
					return proxyToBackend("/api/generation/jobs", {
						method: "GET",
						query: {
							ownerId: user.id,
							sceneId: body.sceneId,
							mediaType: "video",
						},
					});
				} catch (err) {
					console.error("[generate-scene-video] Status check error:", err);
					return Response.json(
						{
							success: false,
							status: "failed",
							error:
								err instanceof Error
									? err.message
									: "Failed to check video status",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
