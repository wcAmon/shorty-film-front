import * as fs from "node:fs";
import * as path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";

// Configure FFmpeg and FFprobe paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const VIDEO_CACHE_DIR = path.join(process.cwd(), "public", "video_cache");

// Get audio duration using ffprobe
function getAudioDuration(filePath: string): Promise<number> {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (err, metadata) => {
			if (err) reject(err);
			else resolve(metadata.format.duration || 0);
		});
	});
}

// Get video duration using ffprobe
function getVideoDuration(filePath: string): Promise<number> {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (err, metadata) => {
			if (err) reject(err);
			else resolve(metadata.format.duration || 0);
		});
	});
}

// Create a video clip from a static image (with silent audio track)
// @ts-expect-error Utility function for future use
function _createImageClip(
	imagePath: string,
	outputPath: string,
	duration: number,
): Promise<void> {
	return new Promise((resolve, reject) => {
		ffmpeg()
			.input(imagePath)
			.inputOptions(["-loop 1", "-framerate 30"])
			// Add silent audio using anullsrc filter
			.input("anullsrc=r=44100:cl=mono")
			.inputOptions(["-f lavfi"])
			.outputOptions([
				`-t ${duration}`,
				"-c:v libx264",
				"-c:a aac",
				"-pix_fmt yuv420p",
				"-vf scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
				"-shortest",
			])
			.output(outputPath)
			.on("end", () => resolve())
			.on("error", (err) => reject(err))
			.run();
	});
}

// Merge video with audio (re-encode for consistent format)
function mergeVideoWithAudio(
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
				"-ar 44100", // Standardize audio sample rate
				"-ac 2", // Stereo audio
				"-b:a 128k", // Audio bitrate
				"-pix_fmt yuv420p",
				"-shortest",
			])
			.output(outputPath)
			.on("end", () => resolve())
			.on("error", (err) => reject(err))
			.run();
	});
}

// Extract a segment from a video
// @ts-expect-error Utility function for future use
function _extractVideoSegment(
	inputPath: string,
	startTime: number,
	duration: number,
	outputPath: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		ffmpeg(inputPath)
			.setStartTime(startTime)
			.setDuration(duration)
			.outputOptions([
				"-c:v libx264",
				"-c:a aac",
				"-avoid_negative_ts make_zero",
			])
			.output(outputPath)
			.on("end", () => resolve())
			.on("error", (err) => reject(err))
			.run();
	});
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
// (1-second segmentation causes audio artifacts)
function getScenePathsDirectly(scenePaths: string[]): string[] {
	return scenePaths;
}

async function main() {
	const exportId = `test_export_${Date.now()}`;
	const workDir = path.join(VIDEO_CACHE_DIR, exportId);

	try {
		console.log("Starting test merge (NO character image insertion)...");

		// Create work directory
		fs.mkdirSync(workDir, { recursive: true });

		// Scene video and audio mappings (01.mp3 -> scene-0, etc.)
		const sceneCount = 12;
		const mergedScenePaths: string[] = [];

		console.log("[1/3] Merging videos with audio...");
		for (let i = 0; i < sceneCount; i++) {
			const audioNum = String(i + 1).padStart(2, "0"); // 01, 02, ...
			const audioPath = path.join(VIDEO_CACHE_DIR, `${audioNum}.mp3`);

			// Find matching video file (scene-{i}-*.mp4)
			const files = fs.readdirSync(VIDEO_CACHE_DIR);
			const videoFile = files.find(
				(f) => f.startsWith(`scene-${i}-`) && f.endsWith(".mp4"),
			);

			if (!videoFile) {
				console.error(`No video file found for scene-${i}`);
				continue;
			}

			const videoPath = path.join(VIDEO_CACHE_DIR, videoFile);
			const mergedPath = path.join(workDir, `scene_${i}_merged.mp4`);

			console.log(`  Merging scene ${i}: ${videoFile} + ${audioNum}.mp3`);

			// Get audio duration for reference
			const audioDuration = await getAudioDuration(audioPath);
			console.log(`    Audio duration: ${audioDuration.toFixed(2)}s`);

			await mergeVideoWithAudio(videoPath, audioPath, mergedPath);
			mergedScenePaths.push(mergedPath);
		}

		console.log(`[2/3] Using merged scenes directly (no segmentation)...`);
		const allSegments = getScenePathsDirectly(mergedScenePaths);
		console.log(`  Total segments: ${allSegments.length}`);

		// Concatenate all segments into final video
		const finalOutputPath = path.join(VIDEO_CACHE_DIR, `${exportId}.mp4`);
		console.log("[3/3] Concatenating final video...");
		await concatenateSegments(allSegments, finalOutputPath);

		// Cleanup work directory
		console.log("Cleaning up...");
		fs.rmSync(workDir, { recursive: true, force: true });

		console.log("\n✅ Export complete!");
		console.log(`Output: ${finalOutputPath}`);

		// Get final video duration
		const finalDuration = await getVideoDuration(finalOutputPath);
		console.log(`Final video duration: ${finalDuration.toFixed(2)}s`);
	} catch (err) {
		console.error("Export error:", err);

		// Cleanup on error
		try {
			if (fs.existsSync(workDir)) {
				fs.rmSync(workDir, { recursive: true, force: true });
			}
		} catch {}
	}
}

main();
