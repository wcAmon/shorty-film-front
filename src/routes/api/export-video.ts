import * as fs from "node:fs";
import * as path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import { createFileRoute } from "@tanstack/react-router";
import ffmpeg from "fluent-ffmpeg";

// Configure FFmpeg and FFprobe paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// Video cache directory
const VIDEO_CACHE_DIR = path.join(process.cwd(), "public", "video_cache");

// Ensure cache directory exists
function ensureCacheDir(): void {
	if (!fs.existsSync(VIDEO_CACHE_DIR)) {
		fs.mkdirSync(VIDEO_CACHE_DIR, { recursive: true });
	}
}

// Request interface
interface ExportVideoRequest {
	scenes: Array<{
		videoBase64: string;
		audioBase64: string;
		audioDuration: number;
	}>;
}

// Response interface
interface ExportVideoResponse {
	success: boolean;
	videoUrl?: string;
	error?: string;
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

// Mix video audio with narration audio (blended)
function mixAudioTracks(
	videoPath: string,
	audioPath: string,
	outputPath: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		ffmpeg()
			.input(videoPath)
			.input(audioPath)
			.complexFilter([
				// Extract audio from video, mix with narration
				// Video audio at 30% volume (background), narration at 100%
				"[0:a]volume=0.3[va]",
				"[1:a]volume=1.0[na]",
				"[va][na]amix=inputs=2:duration=shortest:dropout_transition=0[aout]",
			])
			.outputOptions([
				"-c:v libx264",
				"-map 0:v", // Use video from first input
				"-map [aout]", // Use mixed audio
				"-ar 44100",
				"-ac 2",
				"-b:a 128k",
				"-pix_fmt yuv420p",
				"-shortest",
			])
			.output(outputPath)
			.on("end", () => resolve())
			.on("error", (err) => reject(err))
			.run();
	});
}

// Replace video audio with narration (for videos without audio track)
function replaceAudio(
	videoPath: string,
	audioPath: string,
	outputPath: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		ffmpeg()
			.input(videoPath)
			.input(audioPath)
			.outputOptions([
				"-c:v libx264",
				"-c:a aac",
				"-ar 44100",
				"-ac 2",
				"-b:a 128k",
				"-pix_fmt yuv420p",
				"-shortest",
			])
			.output(outputPath)
			.on("end", () => resolve())
			.on("error", (err) => reject(err))
			.run();
	});
}

// Merge video with audio - uses mixed audio if video has audio track, otherwise replaces
async function mergeVideoWithAudio(
	videoPath: string,
	audioPath: string,
	outputPath: string,
): Promise<void> {
	const hasAudio = await checkVideoHasAudio(videoPath);

	if (hasAudio) {
		// Mix both audio tracks (video audio as background, narration as main)
		console.log("[export-video] Video has audio track, mixing audio...");
		return mixAudioTracks(videoPath, audioPath, outputPath);
	}
	// Replace (add) audio to silent video
	console.log("[export-video] Video has no audio track, adding narration...");
	return replaceAudio(videoPath, audioPath, outputPath);
}

// Concatenate multiple video segments using concat demuxer
function concatenateSegments(
	segmentPaths: string[],
	outputPath: string,
): Promise<void> {
	const concatListPath = path.join(VIDEO_CACHE_DIR, `concat_${Date.now()}.txt`);
	const concatContent = segmentPaths.map((p) => `file '${p}'`).join("\n");
	fs.writeFileSync(concatListPath, concatContent);

	return new Promise((resolve, reject) => {
		ffmpeg()
			.input(concatListPath)
			.inputOptions(["-f concat", "-safe 0"])
			.outputOptions(["-c:v libx264", "-c:a aac", "-pix_fmt yuv420p"])
			.output(outputPath)
			.on("end", () => {
				fs.unlinkSync(concatListPath);
				resolve();
			})
			.on("error", (err) => {
				try {
					fs.unlinkSync(concatListPath);
				} catch {}
				reject(err);
			})
			.run();
	});
}

// Directly use merged scene paths without 1-second segmentation
// (1-second segmentation causes audio artifacts/stuttering)
function getScenePathsDirectly(scenePaths: string[]): string[] {
	return scenePaths;
}

export const Route = createFileRoute("/api/export-video")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const exportId = `export_${Date.now()}`;
				const workDir = path.join(VIDEO_CACHE_DIR, exportId);

				try {
					const body = (await request.json()) as ExportVideoRequest;
					const { scenes } = body;

					// Validation
					if (!scenes || scenes.length === 0) {
						return Response.json(
							{ success: false, error: "At least one scene is required" },
							{ status: 400 },
						);
					}

					console.log(
						`[export-video] Starting export with ${scenes.length} scenes`,
					);

					// Ensure directories exist
					ensureCacheDir();
					fs.mkdirSync(workDir, { recursive: true });

					// Process each scene: save video & audio, merge them
					const mergedScenePaths: string[] = [];

					for (let i = 0; i < scenes.length; i++) {
						const scene = scenes[i];
						console.log(`[export-video] Processing scene ${i + 1}...`);

						// Save video and audio files
						const videoPath = path.join(workDir, `scene_${i}_video.mp4`);
						const audioPath = path.join(workDir, `scene_${i}_audio.mp3`);
						const mergedPath = path.join(workDir, `scene_${i}_merged.mp4`);

						fs.writeFileSync(
							videoPath,
							Buffer.from(scene.videoBase64, "base64"),
						);
						fs.writeFileSync(
							audioPath,
							Buffer.from(scene.audioBase64, "base64"),
						);

						// Merge video with audio
						await mergeVideoWithAudio(videoPath, audioPath, mergedPath);
						mergedScenePaths.push(mergedPath);
					}

					// Use merged scenes directly (no 1-second segmentation to avoid audio artifacts)
					console.log("[export-video] Preparing scenes for concatenation...");
					const allSegments = getScenePathsDirectly(mergedScenePaths);

					// Concatenate all segments into final video
					const finalOutputPath = path.join(VIDEO_CACHE_DIR, `${exportId}.mp4`);
					console.log("[export-video] Concatenating final video...");
					await concatenateSegments(allSegments, finalOutputPath);

					// Cleanup work directory
					console.log("[export-video] Cleaning up...");
					fs.rmSync(workDir, { recursive: true, force: true });

					console.log("[export-video] Export complete!");

					return Response.json({
						success: true,
						videoUrl: `/video_cache/${exportId}.mp4`,
					} as ExportVideoResponse);
				} catch (err) {
					console.error("[export-video] Export error:", err);

					// Cleanup on error
					try {
						if (fs.existsSync(workDir)) {
							fs.rmSync(workDir, { recursive: true, force: true });
						}
					} catch {}

					return Response.json(
						{
							success: false,
							error:
								err instanceof Error ? err.message : "Failed to export video",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
