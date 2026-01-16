import * as fs from "node:fs";
import { fal } from "@fal-ai/client";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { createFileRoute } from "@tanstack/react-router";
import ffmpeg from "fluent-ffmpeg";
import { generateVideoId } from "@/db";
import {
	createVideo,
	updateVideo,
	getSceneById,
	getAudioById,
	getImageById,
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

// Configure FFmpeg and FFprobe paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// Default video engine
const DEFAULT_VIDEO_ENGINE = "fal-ai/kling-video/v2.6/pro/image-to-video";

// In-memory store for pending video jobs (sceneId -> job info)
const pendingJobs = new Map<
	string,
	{
		requestId: string;
		storyId: string;
		sceneId: string;
		videoId: string;
		audioDuration: number;
		audioId: string;
		imageId: string;
		videoEngine: string;
		status: "pending" | "processing" | "completed" | "failed";
		videoUrl?: string;
		error?: string;
	}
>();

// Download video from URL to local file
async function downloadVideoFromUrl(url: string, outputPath: string): Promise<void> {
	const response = await fetch(url);
	const arrayBuffer = await response.arrayBuffer();
	fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
}

// Get video duration using ffprobe
function getVideoDuration(videoPath: string): Promise<number> {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(videoPath, (err, metadata) => {
			if (err) {
				reject(err);
				return;
			}
			const duration = metadata.format.duration || 0;
			resolve(duration);
		});
	});
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

// Step 1: Extract video audio and mix with narration
// Video audio at 30% volume, narration at 100% volume
function mixAudioTracks(
	rawVideoPath: string,
	narrationPath: string,
	mixedAudioPath: string,
	audioDuration: number,
): Promise<void> {
	return new Promise((resolve, reject) => {
		ffmpeg()
			.input(rawVideoPath)
			.input(narrationPath)
			.complexFilter([
				// Video audio at 30% volume
				"[0:a]volume=0.3[va]",
				// Narration at 100% volume
				"[1:a]volume=1.0[na]",
				// Mix both, output duration matches narration (the shorter one)
				"[va][na]amix=inputs=2:duration=first:dropout_transition=0[aout]",
			])
			.outputOptions([
				"-map [aout]",
				"-t",
				String(audioDuration),
				"-c:a aac",
				"-ar 44100",
				"-ac 2",
				"-b:a 128k",
			])
			.output(mixedAudioPath)
			.on("start", (cmd) => {
				console.log(`[generate-scene-video] Mix audio command: ${cmd}`);
			})
			.on("end", () => {
				console.log(`[generate-scene-video] Audio mix complete: ${mixedAudioPath}`);
				resolve();
			})
			.on("error", (err) => {
				console.error(`[generate-scene-video] Audio mix error:`, err);
				reject(err);
			})
			.run();
	});
}

// Step 2: Combine video stream with mixed audio
function combineVideoWithAudio(
	rawVideoPath: string,
	audioPath: string,
	outputPath: string,
	audioDuration: number,
): Promise<void> {
	return new Promise((resolve, reject) => {
		ffmpeg()
			.input(rawVideoPath)
			.input(audioPath)
			.outputOptions([
				"-map 0:v", // Video from raw video
				"-map 1:a", // Audio from mixed audio file
				"-t",
				String(audioDuration), // Trim to audio duration
				"-c:v libx264",
				"-c:a aac",
				"-ar 44100",
				"-ac 2",
				"-b:a 128k",
				"-pix_fmt yuv420p",
				"-movflags +faststart",
			])
			.output(outputPath)
			.on("start", (cmd) => {
				console.log(`[generate-scene-video] Combine command: ${cmd}`);
			})
			.on("end", () => {
				console.log(`[generate-scene-video] Combine complete: ${outputPath}`);
				resolve();
			})
			.on("error", (err) => {
				console.error(`[generate-scene-video] Combine error:`, err);
				reject(err);
			})
			.run();
	});
}

// Main function: Process video with narration audio
// Two-step approach to avoid amix issues:
// 1. If video has audio: mix video audio + narration → mixed audio file
// 2. Combine video stream + mixed audio (or just narration if no video audio)
async function trimAndMergeAudio(
	rawVideoPath: string,
	narrationPath: string,
	outputPath: string,
	audioDuration: number,
	mixedAudioPath: string, // Temp path for intermediate mixed audio
): Promise<void> {
	const videoDuration = await getVideoDuration(rawVideoPath);
	const hasVideoAudio = await checkVideoHasAudio(rawVideoPath);

	console.log(
		`[generate-scene-video] Video duration: ${videoDuration}s, Audio duration: ${audioDuration}s, Has video audio: ${hasVideoAudio}`,
	);

	if (hasVideoAudio) {
		// Step 1: Mix video audio with narration
		await mixAudioTracks(rawVideoPath, narrationPath, mixedAudioPath, audioDuration);
		// Step 2: Combine video stream with mixed audio
		await combineVideoWithAudio(rawVideoPath, mixedAudioPath, outputPath, audioDuration);
	} else {
		// No video audio, just combine video with narration directly
		await combineVideoWithAudio(rawVideoPath, narrationPath, outputPath, audioDuration);
	}
}

// Request/Response interfaces
interface SubmitVideoRequest {
	storyId: string;
	sceneId: string;
	videoPrompt: string;
	imageUrl: string; // Supabase Storage URL
	audioDuration: number;
	videoEngine?: string;
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

export const Route = createFileRoute("/api/generate-scene-video")({
	server: {
		handlers: {
			// POST: Submit a new video generation job
			POST: async ({ request }) => {
				try {
					const body = (await request.json()) as SubmitVideoRequest;
					const { storyId, sceneId, videoPrompt, imageUrl, audioDuration } = body;

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
					if (!imageUrl) {
						return Response.json(
							{ success: false, error: "Scene image URL is required" },
							{ status: 400 },
						);
					}
					if (!audioDuration || audioDuration <= 0) {
						return Response.json(
							{ success: false, error: "Audio duration is required" },
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

					if (!scene.imageId) {
						return Response.json(
							{
								success: false,
								error: "Scene image not found. Generate image first.",
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
						prompt: videoPrompt,
						status: "generating",
					});

					console.log(`[generate-scene-video] Created video record: ${videoId}`);

					// Configure FAL client
					fal.config({
						credentials: process.env.FAL_API_KEY,
					});

					// Determine FAL video duration: only "5" or "10" allowed
					const falDuration = audioDuration <= 5 ? "5" : "10";

					// Ensure temp directory exists
					ensureTempDir();

					console.log(
						`[generate-scene-video] Submitting FAL job for scene ${sceneId}`,
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
					pendingJobs.set(sceneId, {
						requestId: request_id,
						storyId,
						sceneId,
						videoId,
						audioDuration,
						audioId: scene.audioId,
						imageId: scene.imageId,
						videoEngine,
						status: "processing",
					});

					return Response.json({
						success: true,
						requestId: request_id,
						videoId,
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
						`[generate-scene-video] Status for scene ${sceneId}: ${status.status}`,
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
					const result = (await fal.queue.result(job.videoEngine, {
						requestId: job.requestId,
					})) as FalVideoResult;

					console.log(
						`[generate-scene-video] FAL result structure:`,
						JSON.stringify(result, null, 2),
					);

					const falVideoUrl = result.video?.url || result.data?.video?.url;
					if (!falVideoUrl) {
						console.error(
							`[generate-scene-video] No video URL found in result:`,
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
							error: "No video URL returned from FAL-AI",
						} as CheckStatusResponse);
					}

					console.log(
						`[generate-scene-video] Video ready, downloading and merging with audio...`,
					);

					// Get temp paths
					const rawVideoPath = getTempFilePath(`raw-${job.videoId}.mp4`);
					const audioPath = getTempFilePath(`audio-${job.videoId}.mp3`);
					const mixedAudioPath = getTempFilePath(`mixed-${job.videoId}.aac`);
					const finalVideoPath = getTempFilePath(`final-${job.videoId}.mp4`);

					try {
						// Download the generated video from FAL
						await downloadVideoFromUrl(falVideoUrl, rawVideoPath);
						console.log(`[generate-scene-video] Downloaded raw video: ${rawVideoPath}`);

						// Download audio from Supabase Storage
						const audioBuffer = await downloadFromStorage(
							"audios",
							`audio-${storyId}-${sceneId}.mp3`,
						);
						fs.writeFileSync(audioPath, audioBuffer);
						console.log(`[generate-scene-video] Downloaded audio: ${audioPath}`);

						// Trim and merge with narration audio (two-step process)
						await trimAndMergeAudio(
							rawVideoPath,
							audioPath,
							finalVideoPath,
							job.audioDuration,
							mixedAudioPath,
						);

						// Read final video and upload to Supabase Storage
						const finalVideoBuffer = fs.readFileSync(finalVideoPath);
						const videoUrl = await uploadVideo(storyId, sceneId, finalVideoBuffer);

						console.log(`[generate-scene-video] Uploaded video to Supabase: ${videoUrl}`);

						// Update video record with URL and status "completed"
						await updateVideo(job.videoId, {
							videoUrl,
							status: "completed",
							duration: job.audioDuration,
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
							`[generate-scene-video] Video processing complete for scene ${sceneId}`,
						);

						return Response.json({
							success: true,
							status: "completed",
							videoId: job.videoId,
							videoUrl,
							videoDuration: job.audioDuration,
						} as CheckStatusResponse);
					} finally {
						// Clean up temp files
						deleteTempFile(`raw-${job.videoId}.mp4`);
						deleteTempFile(`audio-${job.videoId}.mp3`);
						deleteTempFile(`mixed-${job.videoId}.aac`);
						deleteTempFile(`final-${job.videoId}.mp4`);
					}
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
