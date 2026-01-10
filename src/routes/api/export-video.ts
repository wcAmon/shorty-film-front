import * as fs from "node:fs";
import * as path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { createFileRoute } from "@tanstack/react-router";
import ffmpeg from "fluent-ffmpeg";
import {
	ensureStoryDir,
	getExportedVideoPath,
	getExportedVideoUrl,
	getSceneVideoPath,
	sceneVideoExists,
} from "@/lib/cache";

// Configure FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Request interface
interface ExportVideoRequest {
	storyId: string;
	sceneCount: number;
}

// Response interface
interface ExportVideoResponse {
	success: boolean;
	videoUrl?: string;
	error?: string;
}

// Concatenate multiple video segments using concat demuxer
function concatenateVideos(
	videoPaths: string[],
	outputPath: string,
): Promise<void> {
	// Create a temporary concat list file
	const concatListPath = path.join(
		path.dirname(outputPath),
		`concat_${Date.now()}.txt`,
	);
	const concatContent = videoPaths.map((p) => `file '${p}'`).join("\n");
	fs.writeFileSync(concatListPath, concatContent);

	console.log(
		`[export-video] Concatenating ${videoPaths.length} videos:`,
		videoPaths,
	);

	return new Promise((resolve, reject) => {
		ffmpeg()
			.input(concatListPath)
			.inputOptions(["-f concat", "-safe 0"])
			.outputOptions([
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
				console.log("[export-video] FFmpeg concat command:", cmd);
			})
			.on("end", () => {
				// Clean up concat list file
				try {
					fs.unlinkSync(concatListPath);
				} catch {}
				console.log("[export-video] Concatenation complete:", outputPath);
				resolve();
			})
			.on("error", (err) => {
				console.error("[export-video] FFmpeg concat error:", err);
				try {
					fs.unlinkSync(concatListPath);
				} catch {}
				reject(err);
			})
			.run();
	});
}

export const Route = createFileRoute("/api/export-video")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				try {
					const body = (await request.json()) as ExportVideoRequest;
					const { storyId, sceneCount } = body;

					// Validation
					if (!storyId?.trim()) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}

					if (!sceneCount || sceneCount < 1) {
						return Response.json(
							{ success: false, error: "Scene count must be at least 1" },
							{ status: 400 },
						);
					}

					console.log(
						`[export-video] Starting export for story ${storyId} with ${sceneCount} scenes`,
					);

					// Ensure story directory exists
					ensureStoryDir(storyId);

					// Collect all scene video paths
					const videoPaths: string[] = [];
					for (let i = 0; i < sceneCount; i++) {
						if (!sceneVideoExists(storyId, i)) {
							return Response.json(
								{
									success: false,
									error: `Scene ${i + 1} video not found. Generate video first.`,
								},
								{ status: 400 },
							);
						}
						videoPaths.push(getSceneVideoPath(storyId, i));
					}

					console.log("[export-video] All scene videos found, starting concatenation...");

					// Concatenate all scene videos
					const exportPath = getExportedVideoPath(storyId);
					await concatenateVideos(videoPaths, exportPath);

					const exportUrl = getExportedVideoUrl(storyId);
					console.log(`[export-video] Export complete: ${exportUrl}`);

					return Response.json({
						success: true,
						videoUrl: exportUrl,
					} as ExportVideoResponse);
				} catch (err) {
					console.error("[export-video] Export error:", err);

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
