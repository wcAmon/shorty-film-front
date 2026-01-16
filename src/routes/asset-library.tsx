import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Film, ImageIcon, Loader2 } from "lucide-react";

interface AssetImage {
	id: string;
	imageUrl: string | null;
	prompt: string;
	imageType: string;
	createdAt: string | null;
}

interface AssetVideo {
	id: string;
	videoUrl: string | null;
	prompt: string;
	duration: number | null;
	createdAt: string | null;
}

interface AssetLibraryResponse {
	success: boolean;
	images?: AssetImage[];
	videos?: AssetVideo[];
	error?: string;
}

async function fetchAssetLibrary(): Promise<AssetLibraryResponse> {
	const response = await fetch("/api/asset-library");
	return response.json();
}

export const Route = createFileRoute("/asset-library")({
	component: AssetLibraryPage,
});

function AssetLibraryPage() {
	const { data, isLoading, error } = useQuery({
		queryKey: ["asset-library"],
		queryFn: fetchAssetLibrary,
	});

	const formatDate = (dateString: string | null) => {
		if (!dateString) return "Unknown date";
		return new Date(dateString).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const truncatePrompt = (prompt: string, maxLength = 80) => {
		if (prompt.length <= maxLength) return prompt;
		return `${prompt.slice(0, maxLength)}...`;
	};

	return (
		<div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
			<div className="max-w-6xl mx-auto px-4 py-8">
				{/* Header */}
				<div className="flex items-center gap-4 mb-8">
					<Link
						to="/"
						className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
					>
						<ArrowLeft className="w-5 h-5" />
					</Link>
					<h1 className="text-3xl font-bold text-white">Asset Library</h1>
				</div>

				{/* Loading state */}
				{isLoading && (
					<div className="flex items-center justify-center py-20">
						<Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
						<span className="ml-3 text-slate-400">Loading assets...</span>
					</div>
				)}

				{/* Error state */}
				{error && (
					<div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300">
						Failed to load asset library: {error.message}
					</div>
				)}

				{/* Content */}
				{data?.success && (
					<div className="space-y-10">
						{/* Images Section */}
						<section>
							<h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
								<ImageIcon className="w-5 h-5 text-purple-400" />
								Images ({data.images?.length || 0})
							</h2>

							{data.images && data.images.length > 0 ? (
								<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
									{data.images.map((image) => (
										<div
											key={image.id}
											className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden hover:border-purple-500/50 transition-colors"
										>
											{image.imageUrl ? (
												<img
													src={image.imageUrl}
													alt={image.prompt}
													className="w-full object-cover"
													style={{ aspectRatio: "9/16" }}
												/>
											) : (
												<div
													className="w-full bg-slate-900 flex items-center justify-center text-slate-600"
													style={{ aspectRatio: "9/16" }}
												>
													<ImageIcon className="w-8 h-8" />
												</div>
											)}
											<div className="p-3">
												<p className="text-xs text-slate-400 mb-1">
													{formatDate(image.createdAt)}
												</p>
												<p
													className="text-sm text-slate-300 line-clamp-2"
													title={image.prompt}
												>
													{truncatePrompt(image.prompt)}
												</p>
												<span className="mt-2 inline-block text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
													{image.imageType}
												</span>
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="text-center py-10 text-slate-500">
									<ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
									<p>No orphaned images yet</p>
									<p className="text-sm mt-1">
										Regenerate scene images to see them here
									</p>
								</div>
							)}
						</section>

						{/* Videos Section */}
						<section>
							<h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
								<Film className="w-5 h-5 text-indigo-400" />
								Videos ({data.videos?.length || 0})
							</h2>

							{data.videos && data.videos.length > 0 ? (
								<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
									{data.videos.map((video) => (
										<div
											key={video.id}
											className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden hover:border-indigo-500/50 transition-colors"
										>
											{video.videoUrl ? (
												<video
													src={video.videoUrl}
													className="w-full object-cover"
													style={{ aspectRatio: "9/16" }}
													controls
													preload="metadata"
												>
													<track kind="captions" />
												</video>
											) : (
												<div
													className="w-full bg-slate-900 flex items-center justify-center text-slate-600"
													style={{ aspectRatio: "9/16" }}
												>
													<Film className="w-8 h-8" />
												</div>
											)}
											<div className="p-3">
												<div className="flex items-center justify-between mb-1">
													<p className="text-xs text-slate-400">
														{formatDate(video.createdAt)}
													</p>
													{video.duration && (
														<span className="text-xs text-indigo-400">
															{video.duration.toFixed(1)}s
														</span>
													)}
												</div>
												<p
													className="text-sm text-slate-300 line-clamp-2"
													title={video.prompt}
												>
													{truncatePrompt(video.prompt)}
												</p>
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="text-center py-10 text-slate-500">
									<Film className="w-12 h-12 mx-auto mb-3 opacity-50" />
									<p>No orphaned videos yet</p>
									<p className="text-sm mt-1">
										Regenerate scene videos to see them here
									</p>
								</div>
							)}
						</section>
					</div>
				)}

				{/* Empty state if no data */}
				{data?.success &&
					(!data.images || data.images.length === 0) &&
					(!data.videos || data.videos.length === 0) && (
						<div className="text-center py-20 text-slate-500">
							<div className="flex justify-center gap-4 mb-4">
								<ImageIcon className="w-12 h-12 opacity-50" />
								<Film className="w-12 h-12 opacity-50" />
							</div>
							<p className="text-lg">Your asset library is empty</p>
							<p className="text-sm mt-2">
								When you regenerate images or videos, the old ones will appear
								here
							</p>
						</div>
					)}
			</div>
		</div>
	);
}
