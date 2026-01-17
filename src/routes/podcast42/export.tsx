import { createFileRoute, redirect } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Download, FileVideo, Film, Loader2 } from "lucide-react";
import { useExportPodcast42Video } from "@/hooks/use-podcast42-api";
import { podcast42Actions, podcast42Store } from "@/stores/podcast42.store";

export const Route = createFileRoute("/podcast42/export")({
	beforeLoad: () => {
		const state = podcast42Store.state;
		const allScenesHaveVideos =
			state.scenes.length > 0 &&
			state.scenes.every((scene) => scene.videoBase64 && scene.audioBase64);

		if (!allScenesHaveVideos) {
			throw redirect({ to: "/podcast42/scenes" });
		}
	},
	component: Podcast42ExportPage,
});

function Podcast42ExportPage() {
	// React Query mutation
	const exportVideoMutation = useExportPodcast42Video();

	// Subscribe to store state
	const scenes = useStore(podcast42Store, (state) => state.scenes);
	const storyId = useStore(podcast42Store, (state) => state.storyId);
	const isExportingVideo = useStore(
		podcast42Store,
		(state) => state.isExportingVideo,
	);
	const exportedVideoUrl = useStore(
		podcast42Store,
		(state) => state.exportedVideoUrl,
	);
	const exportError = useStore(podcast42Store, (state) => state.exportError);

	// Handle export video
	const handleExportVideo = () => {
		if (!storyId) return;

		podcast42Actions.setIsExportingVideo(true);
		podcast42Actions.setExportError(null);
		podcast42Actions.setExportedVideoUrl(null);

		// Extract videoIndices from scenes in their current order
		// This ensures export follows the user's reordered scene sequence
		const videoIndices = scenes
			.map((scene) => scene.videoIndex)
			.filter((idx): idx is number => idx !== undefined);

		// Only pass videoIndices if all scenes have them (for backwards compatibility)
		const hasAllVideoIndices = videoIndices.length === scenes.length;

		exportVideoMutation.mutate(
			{
				storyId,
				sceneCount: scenes.length,
				...(hasAllVideoIndices && { videoIndices }),
			},
			{
				onSuccess: (result) => {
					if (result.success && result.videoUrl) {
						podcast42Actions.setExportedVideoUrl(result.videoUrl);
					} else {
						podcast42Actions.setExportError(
							result.error || "Failed to export video",
						);
					}
					podcast42Actions.setIsExportingVideo(false);
				},
				onError: (err) => {
					podcast42Actions.setExportError(
						err instanceof Error ? err.message : "Failed to export video",
					);
					podcast42Actions.setIsExportingVideo(false);
				},
			},
		);
	};

	// Handle download exported video
	const handleDownloadExportedVideo = () => {
		if (!exportedVideoUrl) return;
		const link = document.createElement("a");
		link.href = exportedVideoUrl;
		link.download = `podcast42_${Date.now()}.mp4`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	return (
		<div className="space-y-8">
			{/* Export Video Section */}
			<div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
				<h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
					<FileVideo className="w-5 h-5 text-amber-400" />
					Export Final Video
				</h3>

				<p className="text-slate-400 mb-6">
					Your {scenes.length} dialogue scene
					{scenes.length > 1 ? "s are" : " is"} ready to be merged into a single
					podcast video. Click the button below to start the export process.
				</p>

				{exportError && (
					<div className="mb-4 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300">
						{exportError}
					</div>
				)}

				<div className="flex items-center gap-4">
					<button
						type="button"
						onClick={handleExportVideo}
						disabled={isExportingVideo || !!exportedVideoUrl}
						className="flex-1 py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-amber-500/30 flex items-center justify-center gap-3"
					>
						{isExportingVideo ? (
							<>
								<Loader2 className="w-6 h-6 animate-spin" />
								Exporting Video...
							</>
						) : exportedVideoUrl ? (
							<>
								<Film className="w-6 h-6" />
								Export Complete!
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

			{/* Video Preview (16:9 landscape) */}
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
							className="max-w-2xl w-full rounded-lg shadow-lg"
							style={{ aspectRatio: "16/9" }}
						>
							<track kind="captions" />
						</video>
					</div>
					<p className="text-center text-slate-400 text-sm mt-4">
						Your podcast video is ready! Click the download button above to save
						it.
					</p>
				</div>
			)}
		</div>
	);
}
