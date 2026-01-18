import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ImageIcon, Loader2, Check } from "lucide-react";
import { getThumbnailUrl } from "@/lib/image-utils";
import { authFetch } from "@/hooks/use-auth";

interface AssetImage {
	id: string;
	imageUrl: string;
	prompt: string;
	imageType: string;
	storyId: string | null;
	createdAt: string | null;
}

interface AssetPickerModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSelect: (imageUrl: string, imageId: string) => void;
	title?: string;
}

async function fetchAssetLibrary() {
	const response = await authFetch("/api/asset-library");
	if (!response.ok) {
		throw new Error("Failed to fetch asset library");
	}
	return response.json() as Promise<{
		success: boolean;
		images?: AssetImage[];
	}>;
}

export function AssetPickerModal({
	isOpen,
	onClose,
	onSelect,
	title = "Select from Asset Library",
}: AssetPickerModalProps) {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

	const { data, isLoading, error } = useQuery({
		queryKey: ["asset-library-picker"],
		queryFn: fetchAssetLibrary,
		enabled: isOpen,
	});

	const handleSelect = (image: AssetImage) => {
		setSelectedId(image.id);
		setSelectedUrl(image.imageUrl);
	};

	const handleConfirm = () => {
		if (selectedUrl && selectedId) {
			onSelect(selectedUrl, selectedId);
			onClose();
			// Reset selection
			setSelectedId(null);
			setSelectedUrl(null);
		}
	};

	const handleClose = () => {
		setSelectedId(null);
		setSelectedUrl(null);
		onClose();
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/70 backdrop-blur-sm"
				onClick={handleClose}
				onKeyDown={(e) => e.key === "Escape" && handleClose()}
			/>

			{/* Modal */}
			<div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
					<h2 className="text-xl font-semibold text-white flex items-center gap-2">
						<ImageIcon className="w-5 h-5 text-purple-400" />
						{title}
					</h2>
					<button
						type="button"
						onClick={handleClose}
						className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				{/* Content */}
				<div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
					{isLoading && (
						<div className="flex items-center justify-center py-20">
							<Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
							<span className="ml-3 text-slate-400">Loading assets...</span>
						</div>
					)}

					{error && (
						<div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300">
							Failed to load assets: {error.message}
						</div>
					)}

					{data?.success && data.images && data.images.length === 0 && (
						<div className="text-center py-20 text-slate-500">
							<ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
							<p className="text-lg">No images available</p>
							<p className="text-sm mt-2">
								Generate some images first to use them here
							</p>
						</div>
					)}

					{data?.success && data.images && data.images.length > 0 && (
						<div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
							{data.images.map((image) => (
								<button
									type="button"
									key={image.id}
									onClick={() => handleSelect(image)}
									className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
										selectedId === image.id
											? "border-purple-500 ring-2 ring-purple-500/50"
											: "border-slate-700 hover:border-slate-500"
									}`}
								>
									{image.imageUrl ? (
										<img
											src={getThumbnailUrl(image.imageUrl, 200)}
											alt={image.prompt}
											className="w-full object-cover"
											style={{ aspectRatio: "9/16" }}
											loading="lazy"
										/>
									) : (
										<div
											className="w-full bg-slate-800 flex items-center justify-center text-slate-600"
											style={{ aspectRatio: "9/16" }}
										>
											<ImageIcon className="w-6 h-6" />
										</div>
									)}

									{/* Selection indicator */}
									{selectedId === image.id && (
										<div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
											<div className="bg-purple-500 rounded-full p-2">
												<Check className="w-5 h-5 text-white" />
											</div>
										</div>
									)}

									{/* Hover overlay */}
									<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
										<div className="absolute bottom-0 left-0 right-0 p-2">
											<p className="text-xs text-white line-clamp-2">
												{image.prompt}
											</p>
										</div>
									</div>
								</button>
							))}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700 bg-slate-900/50">
					<button
						type="button"
						onClick={handleClose}
						className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={!selectedUrl}
						className={`px-4 py-2 rounded-lg font-medium transition-colors ${
							selectedUrl
								? "bg-purple-600 hover:bg-purple-500 text-white"
								: "bg-slate-700 text-slate-500 cursor-not-allowed"
						}`}
					>
						Select Image
					</button>
				</div>
			</div>
		</div>
	);
}
