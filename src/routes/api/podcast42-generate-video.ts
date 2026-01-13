import * as fs from "node:fs";
import { fal } from "@fal-ai/client";
import { createFileRoute } from "@tanstack/react-router";
import {
	ensureStoryDir,
	getSceneVideoPath,
	getSceneVideoUrl,
	readSceneVideoBase64,
	loadStoryMetadata,
	saveStoryMetadata,
} from "@/lib/cache";

// Video engines for podcast42 talking-head generation
const OMNIHUMAN_ENGINE = "fal-ai/bytedance/omnihuman/v1.5";
const AURORA_ENGINE = "fal-ai/creatify/aurora";

// Video engine type
type Podcast42VideoEngine = "omnihuman" | "aurora";

// In-memory store for pending video jobs (storyId-sceneIndex -> job info)
const pendingJobs = new Map<
	string,
	{
		requestId: string;
		storyId: string;
		sceneIndex: number;
		videoEngine: Podcast42VideoEngine;
		status: "pending" | "processing" | "completed" | "failed";
		videoUrl?: string;
		videoDuration?: number;
		error?: string;
	}
>();

// Download video from URL to local file
async function downloadVideo(url: string, outputPath: string): Promise<void> {
	const response = await fetch(url);
	const arrayBuffer = await response.arrayBuffer();
	fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
}

// Request/Response interfaces
interface SubmitVideoRequest {
	storyId: string;
	sceneIndex: number;
	imageUrl: string; // FAL storage URL for character image
	audioBase64: string; // Base64 encoded audio
	videoEngine?: Podcast42VideoEngine; // Default: "omnihuman"
}

interface SubmitVideoResponse {
	success: boolean;
	requestId?: string;
	error?: string;
}

interface CheckStatusRequest {
	storyId: string;
	sceneIndex: number;
}

interface CheckStatusResponse {
	success: boolean;
	status: "pending" | "processing" | "completed" | "failed";
	videoUrl?: string;
	videoBase64?: string;
	videoDuration?: number;
	error?: string;
}

// FAL-AI queue.result response type for video engines
interface FalVideoResult {
	video?: {
		url?: string;
	};
	data?: {
		video?: {
			url?: string;
		};
	};
}

// Helper to get FAL endpoint from video engine
function getVideoEndpoint(engine: Podcast42VideoEngine): string {
	return engine === "aurora" ? AURORA_ENGINE : OMNIHUMAN_ENGINE;
}

// FAL queue status type
interface FalQueueStatus {
	status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
	response_url?: string;
}

// Generate job key from storyId and sceneIndex
function getJobKey(storyId: string, sceneIndex: number): string {
	return `${storyId}-${sceneIndex}`;
}

export const Route = createFileRoute("/api/podcast42-generate-video")({
	server: {
		handlers: {
			// POST: Submit a new video generation job
			POST: async ({ request }) => {
				try {
					const body = (await request.json()) as SubmitVideoRequest;
					const { storyId, sceneIndex, imageUrl, audioBase64, videoEngine = "omnihuman" } = body;

					// Validation
					if (!storyId?.trim()) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}
					if (typeof sceneIndex !== "number" || sceneIndex < 0) {
						return Response.json(
							{ success: false, error: "Valid scene index is required" },
							{ status: 400 },
						);
					}
					if (!imageUrl?.trim()) {
						return Response.json(
							{ success: false, error: "Character image URL is required" },
							{ status: 400 },
						);
					}
					if (!audioBase64) {
						return Response.json(
							{ success: false, error: "Audio is required" },
							{ status: 400 },
						);
					}

					const jobKey = getJobKey(storyId, sceneIndex);

					// Check if job already exists
					const existingJob = pendingJobs.get(jobKey);
					if (existingJob && existingJob.status === "processing") {
						return Response.json({
							success: true,
							requestId: existingJob.requestId,
						} as SubmitVideoResponse);
					}

					// Configure FAL client
					fal.config({
						credentials: process.env.FAL_API_KEY,
					});

					// Ensure story directory exists
					ensureStoryDir(storyId);

					// Upload audio to FAL storage
					const audioBuffer = Buffer.from(audioBase64, "base64");
					const audioBlob = new Blob([audioBuffer], { type: "audio/mp3" });
					const audioUrl = await fal.storage.upload(audioBlob);

					const endpoint = getVideoEndpoint(videoEngine);
					console.log(
						`[podcast42-generate-video] Submitting ${videoEngine} job for ${jobKey}`,
					);
					console.log(
						`[podcast42-generate-video] Engine: ${endpoint}`,
					);
					console.log(
						`[podcast42-generate-video] Image URL: ${imageUrl}`,
					);
					console.log(
						`[podcast42-generate-video] Audio URL: ${audioUrl}`,
					);

					// Submit to FAL queue with selected video engine
					const inputParams = videoEngine === "omnihuman"
						? { image_url: imageUrl, audio_url: audioUrl, resolution: "720p" }
						: { image_url: imageUrl, audio_url: audioUrl };

					const { request_id } = await fal.queue.submit(endpoint, {
						input: inputParams,
					});

					console.log(
						`[podcast42-generate-video] Job submitted with request_id: ${request_id}`,
					);

					// Store job info
					pendingJobs.set(jobKey, {
						requestId: request_id,
						storyId,
						sceneIndex,
						videoEngine,
						status: "processing",
					});

					return Response.json({
						success: true,
						requestId: request_id,
					} as SubmitVideoResponse);
				} catch (err) {
					console.error("[podcast42-generate-video] Submit error:", err);

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

			// PUT: Check status and get result if completed
			PUT: async ({ request }) => {
				try {
					const body = (await request.json()) as CheckStatusRequest;
					const { storyId, sceneIndex } = body;

					if (!storyId?.trim()) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}
					if (typeof sceneIndex !== "number" || sceneIndex < 0) {
						return Response.json(
							{ success: false, error: "Valid scene index is required" },
							{ status: 400 },
						);
					}

					const jobKey = getJobKey(storyId, sceneIndex);
					const job = pendingJobs.get(jobKey);

					if (!job) {
						return Response.json(
							{ success: false, error: "No pending job for this scene" },
							{ status: 404 },
						);
					}

					// If already completed, return cached result
					if (job.status === "completed") {
						const videoUrl = getSceneVideoUrl(storyId, sceneIndex);
						const videoBase64 = readSceneVideoBase64(storyId, sceneIndex);
						return Response.json({
							success: true,
							status: "completed",
							videoUrl,
							videoBase64,
							videoDuration: job.videoDuration,
						} as CheckStatusResponse);
					}

					if (job.status === "failed") {
						return Response.json({
							success: false,
							status: "failed",
							error: job.error,
						} as CheckStatusResponse);
					}

					// Configure FAL client
					fal.config({
						credentials: process.env.FAL_API_KEY,
					});

					// Get the correct endpoint for this job's video engine
					const endpoint = getVideoEndpoint(job.videoEngine);

					// Check FAL queue status
					const status = (await fal.queue.status(endpoint, {
						requestId: job.requestId,
						logs: false,
					})) as FalQueueStatus;

					console.log(
						`[podcast42-generate-video] Status for ${jobKey}: ${status.status}`,
					);

					if (status.status === "IN_QUEUE" || status.status === "IN_PROGRESS") {
						return Response.json({
							success: true,
							status: "processing",
						} as CheckStatusResponse);
					}

					if (status.status === "FAILED") {
						pendingJobs.set(jobKey, {
							...job,
							status: "failed",
							error: "Video generation failed",
						});
						return Response.json({
							success: false,
							status: "failed",
							error: "Video generation failed",
						} as CheckStatusResponse);
					}

					// COMPLETED - get the result
					const result = (await fal.queue.result(endpoint, {
						requestId: job.requestId,
					})) as FalVideoResult;

					console.log(
						`[podcast42-generate-video] FAL result structure:`,
						JSON.stringify(result, null, 2),
					);

					const videoUrl = result.video?.url || result.data?.video?.url;
					if (!videoUrl) {
						console.error(
							`[podcast42-generate-video] No video URL found in result:`,
							result,
						);
						pendingJobs.set(jobKey, {
							...job,
							status: "failed",
							error: "No video URL in result",
						});
						return Response.json({
							success: false,
							status: "failed",
							error: `No video URL returned from ${job.videoEngine}`,
						} as CheckStatusResponse);
					}

					console.log(
						`[podcast42-generate-video] Video ready, downloading...`,
					);

					// Get paths
					const finalVideoPath = getSceneVideoPath(storyId, sceneIndex);

					// Download the generated video directly (OmniHuman already includes audio)
					await downloadVideo(videoUrl, finalVideoPath);
					console.log(`[podcast42-generate-video] Downloaded video: ${finalVideoPath}`);

					// Update job status
					const finalVideoUrl = getSceneVideoUrl(storyId, sceneIndex);
					pendingJobs.set(jobKey, {
						...job,
						status: "completed",
						videoUrl: finalVideoUrl,
					});

					console.log(
						`[podcast42-generate-video] Video processing complete for ${jobKey}`,
					);

					// Update metadata if it exists
					const existingMetadata = loadStoryMetadata(storyId);
					if (existingMetadata && existingMetadata.scenes[sceneIndex]) {
						existingMetadata.scenes[sceneIndex].hasVideo = true;
						saveStoryMetadata(existingMetadata);
					}

					// Read video as base64 for frontend display
					const videoBase64 = readSceneVideoBase64(storyId, sceneIndex);

					return Response.json({
						success: true,
						status: "completed",
						videoUrl: finalVideoUrl,
						videoBase64,
					} as CheckStatusResponse);
				} catch (err) {
					console.error("[podcast42-generate-video] Status check error:", err);

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
