import { createFileRoute, redirect } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Download, FileVideo, Film, Loader2 } from "lucide-react";
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

// Export Page: Video merging + Final video preview + Download
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

	// Handle export video
	const handleExportVideo = () => {
		if (!storyId) return;

		aistoryActions.setIsExportingVideo(true);
		aistoryActions.setExportError(null);
		aistoryActions.setExportedVideoUrl(null);

		exportVideoMutation.mutate(
			{
				storyId,
			},
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
			// Fetch the video as blob to handle cross-origin download
			const response = await fetch(exportedVideoUrl);
			const blob = await response.blob();

			// Create object URL and trigger download
			const blobUrl = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = blobUrl;
			link.download = `shorty_film_${Date.now()}.mp4`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);

			// Clean up object URL
			URL.revokeObjectURL(blobUrl);
		} catch (error) {
			console.error("Download failed:", error);
			aistoryActions.setExportError("Failed to download video");
		}
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
					Your {scenes.length} scene{scenes.length > 1 ? "s are" : " is"} ready
					to be merged into a single video. Click the button below to start the
					export process.
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
