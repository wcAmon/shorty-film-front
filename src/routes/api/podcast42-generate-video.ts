import * as fs from "node:fs";
import { fal } from "@fal-ai/client";
import { createFileRoute } from "@tanstack/react-router";
import { generateVideoId } from "@/db";
import {
	createVideo,
	updateVideo,
	getSceneById,
	getAudioById,
	updateSceneVideo,
} from "@/db/queries";
import {
	uploadVideo,
	downloadFromStorage,
} from "@/lib/supabase-storage";
import {
	getTempFilePath,
	deleteTempFile,
	ensureTempDir,
} from "@/lib/cache";

// Video engines for podcast42 talking-head generation
const OMNIHUMAN_ENGINE = "fal-ai/bytedance/omnihuman/v1.5";
const AURORA_ENGINE = "fal-ai/creatify/aurora";

// Video engine type
type Podcast42VideoEngine = "omnihuman" | "aurora";

// In-memory store for pending video jobs (sceneId -> job info)
const pendingJobs = new Map<
	string,
	{
		requestId: string;
		storyId: string;
		sceneId: string;
		videoId: string;
		videoEngine: Podcast42VideoEngine;
		status: "pending" | "processing" | "completed" | "failed";
		videoUrl?: string;
		videoDuration?: number;
		error?: string;
	}
>();

// Download video from URL to local file
async function downloadVideoFromUrl(url: string, outputPath: string): Promise<void> {
	const response = await fetch(url);
	const arrayBuffer = await response.arrayBuffer();
	fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
}

// Request/Response interfaces
interface SubmitVideoRequest {
	storyId: string;
	sceneId: string;
	imageUrl: string; // FAL storage URL for character image
	videoEngine?: Podcast42VideoEngine; // Default: "omnihuman"
}

interface SubmitVideoResponse {
	success: boolean;
	requestId?: string;
	videoId?: string;
	error?: string;
}

interface CheckStatusRequest {
	storyId: string;
	sceneId: string;
}

interface CheckStatusResponse {
	success: boolean;
	status: "pending" | "processing" | "completed" | "failed";
	videoId?: string;
	videoUrl?: string;
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

export const Route = createFileRoute("/api/podcast42-generate-video")({
	server: {
		handlers: {
			// POST: Submit a new video generation job
			POST: async ({ request }) => {
				try {
					const body = (await request.json()) as SubmitVideoRequest;
					const { storyId, sceneId, imageUrl, videoEngine = "omnihuman" } = body;

					// Validation
					if (!storyId?.trim()) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}
					if (!sceneId?.trim()) {
						return Response.json(
							{ success: false, error: "Scene ID is required" },
							{ status: 400 },
						);
					}
					if (!imageUrl?.trim()) {
						return Response.json(
							{ success: false, error: "Character image URL is required" },
							{ status: 400 },
						);
					}

					// Verify scene exists and has audio
					const scene = await getSceneById(sceneId);
					if (!scene) {
						return Response.json(
							{ success: false, error: "Scene not found" },
							{ status: 404 },
						);
					}

					if (!scene.audioId) {
						return Response.json(
							{
								success: false,
								error: "Scene audio not found. Generate audio first.",
							},
							{ status: 400 },
						);
					}

					// Verify audio exists
					const audio = await getAudioById(scene.audioId);
					if (!audio || !audio.audioUrl) {
						return Response.json(
							{
								success: false,
								error: "Audio file not found in storage.",
							},
							{ status: 400 },
						);
					}

					// Check if job already exists
					const existingJob = pendingJobs.get(sceneId);
					if (existingJob && existingJob.status === "processing") {
						return Response.json({
							success: true,
							requestId: existingJob.requestId,
							videoId: existingJob.videoId,
						} as SubmitVideoResponse);
					}

					// Step 1: Create video record with status "generating"
					const videoId = generateVideoId();
					await createVideo({
						id: videoId,
						storyId,
						sceneId,
						imageId: scene.imageId,
						audioId: scene.audioId,
						prompt: `Podcast42 talking-head video for scene ${scene.id}`,
						status: "generating",
					});

					console.log(`[podcast42-generate-video] Created video record: ${videoId}`);

					// Configure FAL client
					fal.config({
						credentials: process.env.FAL_API_KEY,
					});

					// Ensure temp directory exists
					ensureTempDir();

					// Download audio from Supabase Storage and upload to FAL
					const audioBuffer = await downloadFromStorage(
						"audios",
						`audio-${storyId}-${sceneId}.mp3`,
					);
					const audioBlob = new Blob([audioBuffer], { type: "audio/mp3" });
					const audioFalUrl = await fal.storage.upload(audioBlob);

					const endpoint = getVideoEndpoint(videoEngine);
					console.log(
						`[podcast42-generate-video] Submitting ${videoEngine} job for scene ${sceneId}`,
					);
					console.log(
						`[podcast42-generate-video] Engine: ${endpoint}`,
					);
					console.log(
						`[podcast42-generate-video] Image URL: ${imageUrl}`,
					);
					console.log(
						`[podcast42-generate-video] Audio URL: ${audioFalUrl}`,
					);

					// Submit to FAL queue with selected video engine
					const inputParams = videoEngine === "omnihuman"
						? { image_url: imageUrl, audio_url: audioFalUrl, resolution: "720p" }
						: { image_url: imageUrl, audio_url: audioFalUrl };

					const { request_id } = await fal.queue.submit(endpoint, {
						input: inputParams,
					});

					console.log(
						`[podcast42-generate-video] Job submitted with request_id: ${request_id}`,
					);

					// Store job info
					pendingJobs.set(sceneId, {
						requestId: request_id,
						storyId,
						sceneId,
						videoId,
						videoEngine,
						status: "processing",
					});

					return Response.json({
						success: true,
						requestId: request_id,
						videoId,
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
					const { storyId, sceneId } = body;

					if (!storyId?.trim()) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}
					if (!sceneId?.trim()) {
						return Response.json(
							{ success: false, error: "Scene ID is required" },
							{ status: 400 },
						);
					}

					const job = pendingJobs.get(sceneId);

					if (!job) {
						return Response.json(
							{ success: false, error: "No pending job for this scene" },
							{ status: 404 },
						);
					}

					// If already completed, return cached result
					if (job.status === "completed") {
						return Response.json({
							success: true,
							status: "completed",
							videoId: job.videoId,
							videoUrl: job.videoUrl,
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
						`[podcast42-generate-video] Status for scene ${sceneId}: ${status.status}`,
					);

					if (status.status === "IN_QUEUE" || status.status === "IN_PROGRESS") {
						return Response.json({
							success: true,
							status: "processing",
						} as CheckStatusResponse);
					}

					if (status.status === "FAILED") {
						pendingJobs.set(sceneId, {
							...job,
							status: "failed",
							error: "Video generation failed",
						});
						await updateVideo(job.videoId, { status: "ready" });
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

					const falVideoUrl = result.video?.url || result.data?.video?.url;
					if (!falVideoUrl) {
						console.error(
							`[podcast42-generate-video] No video URL found in result:`,
							result,
						);
						pendingJobs.set(sceneId, {
							...job,
							status: "failed",
							error: "No video URL in result",
						});
						await updateVideo(job.videoId, { status: "ready" });
						return Response.json({
							success: false,
							status: "failed",
							error: `No video URL returned from ${job.videoEngine}`,
						} as CheckStatusResponse);
					}

					console.log(
						`[podcast42-generate-video] Video ready, downloading...`,
					);

					// Get temp path
					const tempFilename = `podcast42-${job.videoId}.mp4`;
					const tempVideoPath = getTempFilePath(tempFilename);

					try {
						// Download the generated video directly (OmniHuman already includes audio)
						await downloadVideoFromUrl(falVideoUrl, tempVideoPath);
						console.log(`[podcast42-generate-video] Downloaded video: ${tempVideoPath}`);

						// Read and upload to Supabase Storage
						const videoBuffer = fs.readFileSync(tempVideoPath);
						const videoUrl = await uploadVideo(storyId, sceneId, videoBuffer);

						console.log(`[podcast42-generate-video] Uploaded to Supabase: ${videoUrl}`);

						// Update video record with URL and status "completed"
						await updateVideo(job.videoId, {
							videoUrl,
							status: "completed",
						});

						// Update scene FK reference (orphans old video if exists)
						await updateSceneVideo(sceneId, job.videoId);

						// Update job status
						pendingJobs.set(sceneId, {
							...job,
							status: "completed",
							videoUrl,
						});

						console.log(
							`[podcast42-generate-video] Video processing complete for scene ${sceneId}`,
						);

						return Response.json({
							success: true,
							status: "completed",
							videoId: job.videoId,
							videoUrl,
						} as CheckStatusResponse);
					} finally {
						// Clean up temp file
						deleteTempFile(tempFilename);
					}
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
