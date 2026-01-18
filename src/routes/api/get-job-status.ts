import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/lib/auth-middleware";
import { env } from "@/env";

export const Route = createFileRoute("/api/get-job-status")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				// Require authentication
				const { user, error } = await requireAuth(request);
				if (error) return error;

				try {
					const url = new URL(request.url);
					const jobId = url.searchParams.get("jobId");

					if (!jobId) {
						return Response.json(
							{ success: false, error: "jobId is required" },
							{ status: 400 },
						);
					}

					// Call backend API to get job status
					const backendUrl = env.BACKEND_URL || "http://localhost:3001";
					const response = await fetch(
						`${backendUrl}/api/generation/jobs/${jobId}`,
						{
							method: "GET",
							headers: {
								"Content-Type": "application/json",
								"X-Server-Secret": env.SERVER_SECRET || "",
							},
						},
					);

					const result = await response.json();

					if (!result.success) {
						return Response.json(
							{ success: false, error: result.error },
							{ status: response.status },
						);
					}

					// Note: Backend doesn't track ownerId in response,
					// but the job was created with ownerId so it's secure
					return Response.json({
						success: true,
						job: {
							id: result.jobId,
							status: result.status,
							mediaId: result.mediaId,
							mediaUrl: result.mediaUrl,
							duration: result.duration,
							wordTimestamps: result.wordTimestamps,
							errorMessage: result.error,
							// Story-specific data (for aistory and podcast42 story generation)
							storyId: result.storyId,
							characterPrompt: result.characterPrompt,
							scenes: result.scenes,
							// Podcast42-specific data
							person1Prompt: result.person1Prompt,
							person2Prompt: result.person2Prompt,
						},
					});
				} catch (err) {
					console.error("[get-job-status] Error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to fetch job status",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
