import { createFileRoute, redirect } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Clock, Download, Film, Loader2, PlayCircle } from "lucide-react";
import { useExportVideo } from "@/hooks/use-aistory-api";
import { aistoryActions, aistoryStore } from "@/stores/aistory.store";

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

		exportVideoMutation.mutate(
			{ storyId },
			{
				onSuccess: (result) => {
					if (result.success && result.videoUrl) {
						aistoryActions.setExportedVideoUrl(result.videoUrl);
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
			<div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
				<h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
					<PlayCircle className="w-5 h-5 text-purple-400" />
					Scenes to Export
				</h3>

				{/* Scene List */}
				<div className="space-y-2 mb-6">
					{scenes.map((scene, index) => (
						<div
							key={scene.id}
							className="flex items-center justify-between px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg"
						>
							<div className="flex items-center gap-3">
								<span className="text-slate-500 text-sm font-mono w-6">
									{(index + 1).toString().padStart(2, "0")}
								</span>
								<span className="text-white font-medium">{scene.title}</span>
							</div>
							<div className="flex items-center gap-2 text-slate-400">
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
			</div>

			{/* Export Button Section */}
			<div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
				<h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
					<Film className="w-5 h-5 text-amber-400" />
					Export Final Video
				</h3>

				{exportError && (
					<div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300">
						{exportError.message}
					</div>
				)}

				<div className="flex items-center gap-4">
					<button
						type="button"
						onClick={handleExportVideo}
						disabled={isExportingVideo}
						className="flex-1 py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 disabled:shadow-none flex items-center justify-center gap-3"
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
					</button>

					{exportedVideoUrl && (
						<button
							type="button"
							onClick={handleDownloadExportedVideo}
							className="p-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl shadow-lg flex items-center justify-center"
							title="Download exported video"
						>
							<Download className="w-6 h-6" />
						</button>
					)}
				</div>
			</div>

			{/* Video Preview */}
			{exportedVideoUrl && (
				<div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
					<h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
						<Film className="w-5 h-5 text-emerald-400" />
						Preview
					</h3>
					<div className="flex justify-center">
						<video
							src={exportedVideoUrl}
							controls
							className="max-w-md w-full rounded-lg shadow-lg"
							style={{ aspectRatio: "9/16" }}
						>
							<track kind="captions" />
						</video>
					</div>
					<p className="text-center text-slate-400 text-sm mt-4">
						Your video is ready! Click the download button above to save it.
					</p>
				</div>
			)}
		</div>
	);
}
