import * as fs from "node:fs";
import { fal } from "@fal-ai/client";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { createFileRoute } from "@tanstack/react-router";
import ffmpeg from "fluent-ffmpeg";
import {
	deleteSceneVideoRaw,
	ensureStoryDir,
	getSceneAudioPath,
	getSceneVideoPath,
	getSceneVideoRawPath,
	getSceneVideoUrl,
	readSceneVideoBase64,
	sceneAudioExists,
} from "@/lib/cache";

// Configure FFmpeg and FFprobe paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// Default video engine
const DEFAULT_VIDEO_ENGINE = "fal-ai/kling-video/v2.6/pro/image-to-video";

// In-memory store for pending video jobs (storyId-sceneIndex -> job info)
const pendingJobs = new Map<
	string,
	{
		requestId: string;
		storyId: string;
		sceneIndex: number;
		audioDuration: number;
		videoEngine: string;
		status: "pending" | "processing" | "completed" | "failed";
		videoUrl?: string;
		error?: string;
	}
>();

// Download video from URL to local file
async function downloadVideo(url: string, outputPath: string): Promise<void> {
	const response = await fetch(url);
	const arrayBuffer = await response.arrayBuffer();
	fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
}

// Check if video has an audio track using ffprobe
function checkVideoHasAudio(videoPath: string): Promise<boolean> {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(videoPath, (err, metadata) => {
			if (err) {
				reject(err);
				return;
			}
			const hasAudio = metadata.streams.some(
				(stream) => stream.codec_type === "audio",
			);
			resolve(hasAudio);
		});
	});
}

// Trim video and merge with narration audio
async function trimAndMergeAudio(
	rawVideoPath: string,
	audioPath: string,
	outputPath: string,
	audioDuration: number,
): Promise<void> {
	const hasVideoAudio = await checkVideoHasAudio(rawVideoPath);

	console.log(
		`[generate-scene-video] Trimming to ${audioDuration}s and merging audio (video has audio: ${hasVideoAudio})`,
	);

	return new Promise((resolve, reject) => {
		const command = ffmpeg().input(rawVideoPath).input(audioPath);

		if (hasVideoAudio) {
			// Mix video audio (30% volume) with narration (100% volume)
			command
				.complexFilter([
					"[0:a]volume=0.3[va]",
					"[1:a]volume=1.0[na]",
					"[va][na]amix=inputs=2:duration=first:dropout_transition=0[aout]",
				])
				.outputOptions([
					"-map 0:v",
					"-map [aout]",
					"-t",
					String(audioDuration),
					"-c:v libx264",
					"-c:a aac",
					"-ar 44100",
					"-ac 2",
					"-b:a 128k",
					"-pix_fmt yuv420p",
					"-movflags +faststart",
				]);
		} else {
			// No video audio, just add narration
			command.outputOptions([
				"-map 0:v",
				"-map 1:a",
				"-t",
				String(audioDuration),
				"-c:v libx264",
				"-c:a aac",
				"-ar 44100",
				"-ac 2",
				"-b:a 128k",
				"-pix_fmt yuv420p",
				"-movflags +faststart",
			]);
		}

		command
			.output(outputPath)
			.on("start", (cmd) => {
				console.log(`[generate-scene-video] FFmpeg command: ${cmd}`);
			})
			.on("end", () => {
				console.log(`[generate-scene-video] Merge complete: ${outputPath}`);
				resolve();
			})
			.on("error", (err) => {
				console.error(`[generate-scene-video] Merge error:`, err);
				reject(err);
			})
			.run();
	});
}

// Request/Response interfaces
interface SubmitVideoRequest {
	storyId: string;
	sceneIndex: number;
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

// FAL-AI queue.result response type
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

// FAL queue status type
interface FalQueueStatus {
	status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
	response_url?: string;
}

// Generate job key from storyId and sceneIndex
function getJobKey(storyId: string, sceneIndex: number): string {
	return `${storyId}-${sceneIndex}`;
}

export const Route = createFileRoute("/api/generate-scene-video")({
	server: {
		handlers: {
			// POST: Submit a new video generation job
			POST: async ({ request }) => {
				try {
					const body = (await request.json()) as SubmitVideoRequest;
					const { storyId, sceneIndex, videoPrompt, imageBase64, audioDuration } =
						body;

					// Handle :no-audio suffix
					const rawVideoEngine = body.videoEngine || DEFAULT_VIDEO_ENGINE;
					const isNoAudio = rawVideoEngine.endsWith(":no-audio");
					const videoEngine = isNoAudio
						? rawVideoEngine.replace(":no-audio", "")
						: rawVideoEngine;

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

					// Check if audio file exists in cache
					if (!sceneAudioExists(storyId, sceneIndex)) {
						return Response.json(
							{
								success: false,
								error: "Scene audio not found in cache. Generate audio first.",
							},
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

					// Determine FAL video duration: only "5" or "10" allowed
					const falDuration = audioDuration <= 5 ? "5" : "10";

					// Ensure story directory exists
					ensureStoryDir(storyId);

					// Upload image to FAL storage
					const imageBuffer = Buffer.from(imageBase64, "base64");
					const imageBlob = new Blob([imageBuffer], { type: "image/jpeg" });
					const imageUrl = await fal.storage.upload(imageBlob);

					console.log(
						`[generate-scene-video] Submitting FAL job for ${jobKey}`,
					);
					console.log(
						`[generate-scene-video] Video engine: ${videoEngine}${isNoAudio ? " (no-audio mode)" : ""}`,
					);
					console.log(
						`[generate-scene-video] Audio duration: ${audioDuration}s, FAL duration: ${falDuration}s`,
					);

					// Build FAL input
					const isImageToVideo =
						videoEngine.includes("image-to-video") ||
						videoEngine.includes("ltx-2-19b");
					const isKlingV26Pro = videoEngine.includes("v2.6/pro");

					const falInput = isImageToVideo
						? {
								prompt: videoPrompt,
								image_url: imageUrl,
								duration: falDuration,
								aspect_ratio: "9:16",
								...(isKlingV26Pro && { generate_audio: !isNoAudio }),
							}
						: {
								prompt: videoPrompt,
								image_urls: [imageUrl],
								duration: falDuration,
								aspect_ratio: "9:16",
							};

					// Submit to FAL queue
					const { request_id } = await fal.queue.submit(videoEngine, {
						input: falInput,
					});

					console.log(
						`[generate-scene-video] Job submitted with request_id: ${request_id}`,
					);

					// Store job info
					pendingJobs.set(jobKey, {
						requestId: request_id,
						storyId,
						sceneIndex,
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

					// Check FAL queue status
					const status = (await fal.queue.status(job.videoEngine, {
						requestId: job.requestId,
						logs: false,
					})) as FalQueueStatus;

					console.log(
						`[generate-scene-video] Status for ${jobKey}: ${status.status}`,
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
					const result = (await fal.queue.result(job.videoEngine, {
						requestId: job.requestId,
					})) as FalVideoResult;

					console.log(
						`[generate-scene-video] FAL result structure:`,
						JSON.stringify(result, null, 2),
					);

					const videoUrl = result.video?.url || result.data?.video?.url;
					if (!videoUrl) {
						console.error(
							`[generate-scene-video] No video URL found in result:`,
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
							error: "No video URL returned from FAL-AI",
						} as CheckStatusResponse);
					}

					console.log(
						`[generate-scene-video] Video ready, downloading and merging with audio...`,
					);

					// Get paths
					const rawVideoPath = getSceneVideoRawPath(storyId, sceneIndex);
					const audioPath = getSceneAudioPath(storyId, sceneIndex);
					const finalVideoPath = getSceneVideoPath(storyId, sceneIndex);

					// Download the generated video
					await downloadVideo(videoUrl, rawVideoPath);
					console.log(`[generate-scene-video] Downloaded raw video: ${rawVideoPath}`);

					// Trim and merge with narration audio
					await trimAndMergeAudio(
						rawVideoPath,
						audioPath,
						finalVideoPath,
						job.audioDuration,
					);

					// Clean up raw video file
					deleteSceneVideoRaw(storyId, sceneIndex);

					// Update job status
					const finalVideoUrl = getSceneVideoUrl(storyId, sceneIndex);
					pendingJobs.set(jobKey, {
						...job,
						status: "completed",
						videoUrl: finalVideoUrl,
					});

					console.log(
						`[generate-scene-video] Video processing complete for ${jobKey}`,
					);

					// Read video as base64 for frontend display
					const videoBase64 = readSceneVideoBase64(storyId, sceneIndex);

					return Response.json({
						success: true,
						status: "completed",
						videoUrl: finalVideoUrl,
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
