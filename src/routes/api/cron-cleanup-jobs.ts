import { createFileRoute } from "@tanstack/react-router";
import { isBackendConfigured, proxyToBackend } from "@/lib/backend-proxy";

/**
 * Cron endpoint for cleaning up old jobs
 * Can be called by Vercel Cron, GitHub Actions, or any scheduler
 *
 * POST /api/cron-cleanup-jobs
 *
 * For Vercel Cron, add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron-cleanup-jobs",
 *     "schedule": "0 0 * * *"
 *   }]
 * }
 *
 * This will run daily at midnight UTC
 */
export const Route = createFileRoute("/api/cron-cleanup-jobs")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				// Verify cron secret for security (optional but recommended)
				const cronSecret = process.env.CRON_SECRET;
				const authHeader = request.headers.get("authorization");

				if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
					return Response.json(
						{ success: false, error: "Unauthorized" },
						{ status: 401 },
					);
				}

				// Check if backend is configured
				if (!isBackendConfigured()) {
					return Response.json(
						{
							success: false,
							error: "Backend not configured",
						},
						{ status: 503 },
					);
				}

				try {
					// Call backend cleanup endpoint
					// Keep 10 most recent jobs
					return proxyToBackend("/api/jobs/cleanup?keep=10", {
						method: "POST",
					});
				} catch (err) {
					console.error("[cron-cleanup-jobs] Error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to cleanup jobs",
						},
						{ status: 500 },
					);
				}
			},

			// Also support GET for easier testing
			GET: async ({ request }) => {
				// Verify cron secret for security
				const cronSecret = process.env.CRON_SECRET;
				const authHeader = request.headers.get("authorization");

				if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
					return Response.json(
						{ success: false, error: "Unauthorized" },
						{ status: 401 },
					);
				}

				if (!isBackendConfigured()) {
					return Response.json(
						{
							success: false,
							error: "Backend not configured",
						},
						{ status: 503 },
					);
				}

				try {
					return proxyToBackend("/api/jobs/cleanup?keep=10", {
						method: "POST",
					});
				} catch (err) {
					console.error("[cron-cleanup-jobs] Error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error
									? err.message
									: "Failed to cleanup jobs",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
