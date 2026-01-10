import * as fs from "node:fs";
import * as path from "node:path";
import { fal } from "@fal-ai/client";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { createFileRoute } from "@tanstack/react-router";
import ffmpeg from "fluent-ffmpeg";

// Configure FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Video cache directory - use public/video_cache for frontend accessibility
const VIDEO_CACHE_DIR = path.join(process.cwd(), "public", "video_cache");

// Default video engine
const DEFAULT_VIDEO_ENGINE = "fal-ai/kling-video/v2.6/pro/image-to-video";

// In-memory store for pending video jobs (sceneId -> job info)
const pendingJobs = new Map<
	string,
	{
		requestId: string;
		audioDuration: number;
		videoEngine: string;
		status: "pending" | "processing" | "completed" | "failed";
		videoBase64?: string;
		error?: string;
	}
>();

// Ensure cache directory exists
function ensureCacheDir(): void {
	if (!fs.existsSync(VIDEO_CACHE_DIR)) {
		fs.mkdirSync(VIDEO_CACHE_DIR, { recursive: true });
	}
}

// Download video from URL to local file
async function downloadVideo(url: string, outputPath: string): Promise<void> {
	const response = await fetch(url);
	const arrayBuffer = await response.arrayBuffer();
	fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
}

// Trim video to exact duration using FFmpeg
function trimVideo(
	inputPath: string,
	outputPath: string,
	duration: number,
): Promise<void> {
	return new Promise((resolve, reject) => {
		ffmpeg(inputPath)
			.setDuration(duration)
			.output(outputPath)
			.on("end", () => resolve())
			.on("error", (err) => reject(err))
			.run();
	});
}

// Convert video file to base64
function videoToBase64(filePath: string): string {
	const buffer = fs.readFileSync(filePath);
	return buffer.toString("base64");
}

// Request/Response interfaces
interface SubmitVideoRequest {
	sceneId: string;
	videoPrompt: string;
	imageBase64: string;
	audioDuration: number;
	videoEngine?: string;
}

interface SubmitVideoResponse {
	success: boolean;
	requestId?: string;
	error?: string;
}

interface CheckStatusRequest {
	sceneId: string;
}

interface CheckStatusResponse {
	success: boolean;
	status: "pending" | "processing" | "completed" | "failed";
	videoBase64?: string;
	videoDuration?: number;
	error?: string;
}

// FAL-AI queue.result response type
// The result structure can vary - video may be at top level or nested
interface FalVideoResult {
	video?: {
		url?: string;
	};
	// Alternative structure (wrapped in data)
	data?: {
		video?: {
			url?: string;
		};
	};
}

// FAL queue status type
interface FalQueueStatus {
	status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
	response_url?: string;
}

export const Route = createFileRoute("/api/generate-scene-video")({
	server: {
		handlers: {
			// POST: Submit a new video generation job
			POST: async ({ request }) => {
				try {
					const body = (await request.json()) as SubmitVideoRequest;
					const { sceneId, videoPrompt, imageBase64, audioDuration } = body;
					// Use provided video engine or default
					// Handle :no-audio suffix - parse and store actual engine name
					const rawVideoEngine = body.videoEngine || DEFAULT_VIDEO_ENGINE;
					const isNoAudio = rawVideoEngine.endsWith(":no-audio");
					const videoEngine = isNoAudio
						? rawVideoEngine.replace(":no-audio", "")
						: rawVideoEngine;

					// Validation
					if (!sceneId?.trim()) {
						return Response.json(
							{ success: false, error: "Scene ID is required" },
							{ status: 400 },
						);
					}
					if (!videoPrompt?.trim()) {
						return Response.json(
							{ success: false, error: "Video prompt cannot be empty" },
							{ status: 400 },
						);
					}
					if (!imageBase64) {
						return Response.json(
							{ success: false, error: "Scene image is required" },
							{ status: 400 },
						);
					}
					if (!audioDuration || audioDuration <= 0) {
						return Response.json(
							{ success: false, error: "Audio duration is required" },
							{ status: 400 },
						);
					}

					// Check if job already exists for this scene
					const existingJob = pendingJobs.get(sceneId);
					if (existingJob && existingJob.status === "processing") {
						return Response.json({
							success: true,
							requestId: existingJob.requestId,
						} as SubmitVideoResponse);
					}

					// Configure FAL client with API key
					fal.config({
						credentials: process.env.FAL_API_KEY,
					});

					// Determine FAL video duration: only "5" or "10" allowed
					const falDuration = audioDuration <= 5 ? "5" : "10";

					// Ensure cache directory exists
					ensureCacheDir();

					// Upload image to FAL storage first
					const imageBuffer = Buffer.from(imageBase64, "base64");
					const imageBlob = new Blob([imageBuffer], { type: "image/jpeg" });
					const imageUrl = await fal.storage.upload(imageBlob);

					console.log(
						`[generate-scene-video] Submitting FAL job for scene ${sceneId}`,
					);
					console.log(
						`[generate-scene-video] Video engine: ${videoEngine}${isNoAudio ? " (no-audio mode)" : ""}`,
					);
					console.log(
						`[generate-scene-video] Audio duration: ${audioDuration}s, FAL duration: ${falDuration}s`,
					);

					// Build FAL input based on video engine
					// v2.6 Pro Image-to-Video uses: image_url (single string)
					// LTX-2-19B Image-to-Video uses: image_url (single string)
					// O1 Reference-to-Video uses: image_urls (array)
					const isImageToVideo =
						videoEngine.includes("image-to-video") ||
						videoEngine.includes("ltx-2-19b");

					// Check if this is Kling v2.6 Pro (supports generate_audio option)
					const isKlingV26Pro = videoEngine.includes("v2.6/pro");

					const falInput = isImageToVideo
						? {
								prompt: videoPrompt,
								image_url: imageUrl, // Single URL for v2.6 pro
								duration: falDuration,
								aspect_ratio: "9:16",
								// Only Kling v2.6 Pro supports generate_audio option
								...(isKlingV26Pro && { generate_audio: !isNoAudio }),
							}
						: {
								prompt: videoPrompt,
								image_urls: [imageUrl], // Array for o1 reference-to-video
								duration: falDuration,
								aspect_ratio: "9:16",
							};

					// Submit to FAL queue (non-blocking)
					const { request_id } = await fal.queue.submit(videoEngine, {
						input: falInput,
					});

					console.log(
						`[generate-scene-video] Job submitted with request_id: ${request_id}`,
					);

					// Store job info
					pendingJobs.set(sceneId, {
						requestId: request_id,
						audioDuration,
						videoEngine,
						status: "processing",
					});

					return Response.json({
						success: true,
						requestId: request_id,
					} as SubmitVideoResponse);
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

			// PUT: Check status and get result if completed
			PUT: async ({ request }) => {
				try {
					const body = (await request.json()) as CheckStatusRequest;
					const { sceneId } = body;

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

					// If already completed or failed, return cached result
					if (job.status === "completed") {
						return Response.json({
							success: true,
							status: "completed",
							videoBase64: job.videoBase64,
							videoDuration: job.audioDuration,
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

					// Use the video engine stored with the job
					const videoEngine = job.videoEngine;

					// Check FAL queue status
					const status = (await fal.queue.status(videoEngine, {
						requestId: job.requestId,
						logs: false,
					})) as FalQueueStatus;

					console.log(
						`[generate-scene-video] Status for ${sceneId}: ${status.status}`,
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
						return Response.json({
							success: false,
							status: "failed",
							error: "Video generation failed",
						} as CheckStatusResponse);
					}

					// COMPLETED - get the result
					const result = (await fal.queue.result(videoEngine, {
						requestId: job.requestId,
					})) as FalVideoResult;

					// Debug: log the actual result structure
					console.log(
						`[generate-scene-video] FAL result structure:`,
						JSON.stringify(result, null, 2),
					);

					// Try both possible structures: top-level video or nested in data
					const videoUrl = result.video?.url || result.data?.video?.url;
					if (!videoUrl) {
						console.error(
							`[generate-scene-video] No video URL found in result:`,
							result,
						);
						pendingJobs.set(sceneId, {
							...job,
							status: "failed",
							error: "No video URL in result",
						});
						return Response.json({
							success: false,
							status: "failed",
							error: "No video URL returned from FAL-AI",
						} as CheckStatusResponse);
					}

					console.log(
						`[generate-scene-video] Video ready, downloading and trimming...`,
					);

					// Download the generated video
					ensureCacheDir();
					const rawVideoPath = path.join(VIDEO_CACHE_DIR, `${sceneId}_raw.mp4`);
					await downloadVideo(videoUrl, rawVideoPath);

					// Trim video to exact audioDuration
					const trimmedVideoPath = path.join(VIDEO_CACHE_DIR, `${sceneId}.mp4`);
					await trimVideo(rawVideoPath, trimmedVideoPath, job.audioDuration);

					// Convert trimmed video to base64
					const videoBase64 = videoToBase64(trimmedVideoPath);

					// Clean up raw video file
					fs.unlinkSync(rawVideoPath);

					// Update job status
					pendingJobs.set(sceneId, {
						...job,
						status: "completed",
						videoBase64,
					});

					console.log(
						`[generate-scene-video] Video processing complete for scene ${sceneId}`,
					);

					return Response.json({
						success: true,
						status: "completed",
						videoBase64,
						videoDuration: job.audioDuration,
					} as CheckStatusResponse);
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
