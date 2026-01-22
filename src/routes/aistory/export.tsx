import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { useState } from "react";
import { Captions, Clock, Download, Film, Loader2, Pencil, PlayCircle } from "lucide-react";
import { useExportVideo } from "@/hooks/use-aistory-api";
import { aistoryActions, aistoryStore } from "@/stores/aistory.store";
import {
	subtitleEditorStore,
	subtitleEditorActions,
} from "@/stores/subtitle-editor.store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/aistory/export")({
	beforeLoad: () => {
		const state = aistoryStore.state;
		const allScenesHaveVideos =
			state.scenes.length > 0 &&
			state.scenes.every((scene) => scene.videoUrl && scene.audioUrl);

		if (!allScenesHaveVideos) {
			throw redirect({ to: "/aistory/scenes" });
		}
	},
	component: ExportPage,
});

// Export Page: Scene list with durations + Export button + Video preview
function ExportPage() {
	// React Query mutation
	const exportVideoMutation = useExportVideo();

	// Subscribe to store state
	const scenes = useStore(aistoryStore, (state) => state.scenes);
	const storyId = useStore(aistoryStore, (state) => state.storyId);
	const isExportingVideo = useStore(
		aistoryStore,
		(state) => state.isExportingVideo,
	);
	const exportedVideoUrl = useStore(
		aistoryStore,
		(state) => state.exportedVideoUrl,
	);
	const exportError = useStore(aistoryStore, (state) => state.exportError);

	// Subscribe to subtitle editor store
	const subtitleSegments = useStore(
		subtitleEditorStore,
		(state) => state.segments,
	);
	const subtitleIsInitialized = useStore(
		subtitleEditorStore,
		(state) => state.isInitialized,
	);
	const subtitleGlobalSize = useStore(
		subtitleEditorStore,
		(state) => state.globalSize,
	);
	const subtitleGlobalPosition = useStore(
		subtitleEditorStore,
		(state) => state.globalPosition,
	);

	// Check if any scenes have word timestamps (can use subtitle editor)
	const hasWordTimestamps = scenes.some(
		(s) => s.wordTimestamps && s.wordTimestamps.length > 0,
	);

	// State for enabling/disabling subtitle export
	const [includeSubtitles, setIncludeSubtitles] = useState(true);

	// State for cache-busting timestamp (forces video reload on re-export)
	const [videoTimestamp, setVideoTimestamp] = useState<number | null>(null);

	// Calculate total duration from all scene videos
	const totalDuration = scenes.reduce(
		(acc, scene) => acc + (scene.videoDuration || 0),
		0,
	);

	// Format duration as mm:ss
	const formatDuration = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	// Handle export video
	const handleExportVideo = () => {
		if (!storyId) return;

		aistoryActions.setIsExportingVideo(true);
		aistoryActions.setExportError(null);

		// Get subtitle data if initialized AND user wants subtitles
		const subtitleData = includeSubtitles ? subtitleEditorActions.getExportData() : null;

		exportVideoMutation.mutate(
			{ storyId, subtitleData },
			{
				onSuccess: (result) => {
					if (result.success && result.videoUrl) {
						aistoryActions.setExportedVideoUrl(result.videoUrl);
						// Update timestamp to force video reload (cache-busting)
						setVideoTimestamp(Date.now());
					} else {
						aistoryActions.setExportError(
							result.error || "Failed to export video",
						);
					}
					aistoryActions.setIsExportingVideo(false);
				},
				onError: (err) => {
					aistoryActions.setExportError(
						err instanceof Error ? err.message : "Failed to export video",
					);
					aistoryActions.setIsExportingVideo(false);
				},
			},
		);
	};

	// Handle download exported video from Supabase Storage
	const handleDownloadExportedVideo = async () => {
		if (!exportedVideoUrl) return;

		try {
			const response = await fetch(exportedVideoUrl);
			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = blobUrl;
			link.download = `shorty_film_${Date.now()}.mp4`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(blobUrl);
		} catch (error) {
			console.error("Download failed:", error);
			aistoryActions.setExportError("Failed to download video");
		}
	};

	return (
		<div className="space-y-8">
			{/* Scene List Section */}
			<Card>
				<CardContent className="p-6">
					<h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
						<PlayCircle className="w-5 h-5 text-purple-400" />
						Scenes to Export
					</h3>

					{/* Scene List */}
					<div className="space-y-2 mb-6">
						{scenes.map((scene, index) => (
							<div
								key={scene.id}
								className="flex items-center justify-between px-4 py-3 bg-muted border border-border rounded-lg"
							>
								<div className="flex items-center gap-3">
									<span className="text-muted-foreground text-sm font-mono w-6">
										{(index + 1).toString().padStart(2, "0")}
									</span>
									<span className="text-foreground font-medium">{scene.title}</span>
								</div>
								<div className="flex items-center gap-2 text-muted-foreground">
									<Clock className="w-4 h-4" />
									<span className="text-sm font-mono">
										{scene.videoDuration
											? formatDuration(scene.videoDuration)
											: "--:--"}
									</span>
								</div>
							</div>
						))}
					</div>

					{/* Total Duration */}
					<div className="flex items-center justify-between px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
						<span className="text-amber-400 font-semibold">Total Duration</span>
						<div className="flex items-center gap-2 text-amber-400">
							<Clock className="w-4 h-4" />
							<span className="font-mono font-bold">
								{formatDuration(totalDuration)}
							</span>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Subtitle Settings Card */}
			{hasWordTimestamps && (
				<Card>
					<CardContent className="p-6">
						<div className="flex items-center justify-between mb-4">
							<h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
								<Captions className="w-5 h-5 text-cyan-400" />
								字幕設定
							</h3>

							{/* Toggle for including subtitles */}
							<button
								type="button"
								onClick={() => setIncludeSubtitles(!includeSubtitles)}
								className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
									includeSubtitles ? "bg-cyan-500" : "bg-muted"
								}`}
							>
								<span
									className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
										includeSubtitles ? "translate-x-7" : "translate-x-1"
									}`}
								/>
							</button>
						</div>

						{includeSubtitles ? (
							subtitleIsInitialized && subtitleSegments.length > 0 ? (
								<div className="space-y-4">
									<div className="flex items-center justify-between px-4 py-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
										<div>
											<p className="text-foreground font-medium">
												已設定 {subtitleSegments.length} 個字幕片段
											</p>
											<p className="text-muted-foreground text-sm mt-1">
												大小: {subtitleGlobalSize === "small" ? "小" : subtitleGlobalSize === "medium" ? "中" : "大"} |
												位置: {subtitleGlobalPosition === "top" ? "上" : subtitleGlobalPosition === "center" ? "中" : "下"}
											</p>
										</div>
										<Link to="/aistory/subtitles">
											<Button variant="outline" className="flex items-center gap-2">
												<Pencil className="w-4 h-4" />
												編輯字幕
											</Button>
										</Link>
									</div>
									<p className="text-muted-foreground text-sm">
										字幕將在匯出時燒錄進影片中
									</p>
								</div>
							) : (
								<div className="space-y-4">
									<div className="flex items-center justify-between px-4 py-3 bg-muted border border-border rounded-lg">
										<div>
											<p className="text-foreground font-medium">尚未設定字幕</p>
											<p className="text-muted-foreground text-sm mt-1">
												您可以編輯字幕的顏色、大小和位置
											</p>
										</div>
										<Link to="/aistory/subtitles">
											<Button className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400">
												<Captions className="w-4 h-4" />
												設定字幕
											</Button>
										</Link>
									</div>
								</div>
							)
						) : (
							<div className="px-4 py-3 bg-muted/50 border border-border rounded-lg">
								<p className="text-muted-foreground">
									字幕已停用，匯出將不包含字幕
								</p>
							</div>
						)}
					</CardContent>
				</Card>
			)}

			{/* Export Button Section */}
			<Card>
				<CardContent className="p-6">
					<h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
						<Film className="w-5 h-5 text-amber-400" />
						Export Final Video
					</h3>

					{exportError && (
						<div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300">
							{exportError.message}
						</div>
					)}

					<div className="flex items-center gap-4">
						<Button
							onClick={handleExportVideo}
							disabled={isExportingVideo}
							className="flex-1 py-4 h-auto bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:from-muted disabled:to-muted disabled:cursor-not-allowed text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 disabled:shadow-none flex items-center justify-center gap-3"
						>
							{isExportingVideo ? (
								<>
									<Loader2 className="w-6 h-6 animate-spin" />
									Exporting Video...
								</>
							) : exportedVideoUrl ? (
								<>
									<Film className="w-6 h-6" />
									RE-EXPORT VIDEO
								</>
							) : (
								<>
									<Film className="w-6 h-6" />
									EXPORT VIDEO
								</>
							)}
						</Button>

						{exportedVideoUrl && (
							<Button
								onClick={handleDownloadExportedVideo}
								className="p-4 h-auto bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl shadow-lg flex items-center justify-center"
								title="Download exported video"
							>
								<Download className="w-6 h-6" />
							</Button>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Video Preview */}
			{exportedVideoUrl && (
				<Card>
					<CardContent className="p-6">
						<h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
							<Film className="w-5 h-5 text-emerald-400" />
							Preview
						</h3>
						<div className="flex justify-center">
							<video
								key={videoTimestamp}
								src={`${exportedVideoUrl}${videoTimestamp ? `?t=${videoTimestamp}` : ""}`}
								controls
								className="max-w-md w-full rounded-lg shadow-lg"
								style={{ aspectRatio: "9/16" }}
							>
								<track kind="captions" />
							</video>
						</div>
						<p className="text-center text-muted-foreground text-sm mt-4">
							Your video is ready! Click the download button above to save it.
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
