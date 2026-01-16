import * as fs from "node:fs";
import * as path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { createFileRoute } from "@tanstack/react-router";
import ffmpeg from "fluent-ffmpeg";
import {
	getStoryById,
	updateStory,
	getScenesWithMedia,
} from "@/db/queries";
import {
	uploadExportVideo,
	deleteExportVideo,
	downloadFromStorage,
} from "@/lib/supabase-storage";
import {
	getTempFilePath,
	deleteTempFile,
	ensureTempDir,
} from "@/lib/cache";

// Configure FFmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Request interface
interface ExportVideoRequest {
	storyId: string;
	// Scene IDs in the order they should be exported
	sceneIds?: string[];
}

// Response interface
interface ExportVideoResponse {
	success: boolean;
	videoUrl?: string;
	error?: string;
}

// Concatenate multiple video segments using concat demuxer
// Full re-encode for both video and audio to ensure proper sync and no frame drops
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
		`[podcast42-export-video] Concatenating ${videoPaths.length} videos (full re-encode):`,
		videoPaths,
	);

	return new Promise((resolve, reject) => {
		ffmpeg()
			.input(concatListPath)
			.inputOptions(["-f concat", "-safe 0"])
			.outputOptions([
				// Video settings - high quality, fast encoding
				"-c:v libx264",
				"-preset fast",
				"-crf 18",
				"-pix_fmt yuv420p",
				// Audio settings - re-encode to ensure sync
				"-c:a aac",
				"-b:a 192k",
				"-ar 44100",
				"-ac 2",
				// Sync and optimization
				"-vsync cfr", // Constant frame rate for better sync
				"-async 1", // Audio sync
				"-movflags +faststart",
			])
			.output(outputPath)
			.on("start", (cmd) => {
				console.log("[podcast42-export-video] FFmpeg concat command:", cmd);
			})
			.on("end", () => {
				// Clean up concat list file
				try {
					fs.unlinkSync(concatListPath);
				} catch {}
				console.log(
					"[podcast42-export-video] Concatenation complete:",
					outputPath,
				);
				resolve();
			})
			.on("error", (err) => {
				console.error("[podcast42-export-video] FFmpeg concat error:", err);
				try {
					fs.unlinkSync(concatListPath);
				} catch {}
				reject(err);
			})
			.run();
	});
}

export const Route = createFileRoute("/api/podcast42-export-video")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const tempFiles: string[] = [];

				try {
					const body = (await request.json()) as ExportVideoRequest;
					const { storyId, sceneIds } = body;

					// Validation
					if (!storyId?.trim()) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}

					// Verify story exists
					const story = await getStoryById(storyId);
					if (!story) {
						return Response.json(
							{ success: false, error: "Story not found" },
							{ status: 404 },
						);
					}

					// Validate this is a podcast42 story
					if (story.type !== "podcast42") {
						return Response.json(
							{
								success: false,
								error: "This API is only for podcast42 stories",
							},
							{ status: 400 },
						);
					}

					console.log(
						`[podcast42-export-video] Starting export for story ${storyId}`,
						sceneIds ? `(custom order: ${sceneIds.length} scenes)` : "(sequential order)",
					);

					// Get all scenes with their media
					const scenesWithMedia = await getScenesWithMedia(storyId);

					if (scenesWithMedia.length === 0) {
						return Response.json(
							{ success: false, error: "No scenes found for this story" },
							{ status: 400 },
						);
					}

					// Determine which scenes to export and in what order
					let scenesToExport: typeof scenesWithMedia;
					if (sceneIds && sceneIds.length > 0) {
						// Custom order based on provided scene IDs
						scenesToExport = sceneIds
							.map((id) => scenesWithMedia.find((s) => s.scene.id === id))
							.filter((s): s is NonNullable<typeof s> => s !== undefined);

						if (scenesToExport.length !== sceneIds.length) {
							return Response.json(
								{
									success: false,
									error: "Some scene IDs were not found",
								},
								{ status: 400 },
							);
						}
					} else {
						// Default: use all scenes in order
						scenesToExport = scenesWithMedia;
					}

					// Verify all scenes have videos
					const missingVideos: string[] = [];
					for (const { scene, video } of scenesToExport) {
						if (!video || !video.videoUrl) {
							missingVideos.push(scene.id);
						}
					}

					if (missingVideos.length > 0) {
						return Response.json(
							{
								success: false,
								error: `Scene(s) ${missingVideos.join(", ")} video not found. Generate video first.`,
							},
							{ status: 400 },
						);
					}

					console.log(`[podcast42-export-video] All ${scenesToExport.length} scene videos found, downloading...`);

					// Ensure temp directory exists
					ensureTempDir();

					// Download all scene videos to temp directory
					const videoPaths: string[] = [];
					for (let i = 0; i < scenesToExport.length; i++) {
						const { scene } = scenesToExport[i];
						const tempFilename = `podcast42-export-scene-${storyId}-${scene.id}.mp4`;
						const tempPath = getTempFilePath(tempFilename);

						// Download video from Supabase Storage
						const videoBuffer = await downloadFromStorage(
							"videos",
							`video-${storyId}-${scene.id}.mp4`,
						);
						fs.writeFileSync(tempPath, videoBuffer);

						videoPaths.push(tempPath);
						tempFiles.push(tempFilename);

						console.log(`[podcast42-export-video] Downloaded scene ${i + 1}/${scenesToExport.length}`);
					}

					console.log(
						"[podcast42-export-video] All scene videos downloaded, starting concatenation...",
					);

					// Concatenate all scene videos
					const exportTempFilename = `podcast42-export-final-${storyId}.mp4`;
					const exportTempPath = getTempFilePath(exportTempFilename);
					tempFiles.push(exportTempFilename);

					await concatenateVideos(videoPaths, exportTempPath);

					// Delete old export video from Supabase Storage if exists
					if (story.exportVideoUrl) {
						console.log("[podcast42-export-video] Deleting old export video...");
						await deleteExportVideo(storyId);
					}

					// Read the concatenated video and upload to Supabase Storage
					const exportBuffer = fs.readFileSync(exportTempPath);
					const exportUrl = await uploadExportVideo(storyId, exportBuffer);

					console.log(`[podcast42-export-video] Uploaded to Supabase: ${exportUrl}`);

					// Update story record with new export URL
					await updateStory(storyId, {
						hasExportedVideo: true,
						exportVideoUrl: exportUrl,
					});

					console.log(`[podcast42-export-video] Export complete: ${exportUrl}`);

					return Response.json({
						success: true,
						videoUrl: exportUrl,
					} as ExportVideoResponse);
				} catch (err) {
					console.error("[podcast42-export-video] Export error:", err);

					return Response.json(
						{
							success: false,
							error:
								err instanceof Error ? err.message : "Failed to export video",
						},
						{ status: 500 },
					);
				} finally {
					// Clean up all temp files
					for (const tempFilename of tempFiles) {
						deleteTempFile(tempFilename);
					}
				}
			},
		},
	},
});
