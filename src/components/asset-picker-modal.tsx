import { useQuery } from "@tanstack/react-query";
import { Check, ImageIcon, Loader2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/hooks/use-auth";
import { getThumbnailUrl } from "@/lib/image-utils";

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
			<button
				type="button"
				className="absolute inset-0 bg-black/70 backdrop-blur-sm"
				onClick={handleClose}
				onKeyDown={(e) => e.key === "Escape" && handleClose()}
				aria-label="Close modal"
			/>

			{/* Modal */}
			<div className="relative max-h-[80vh] w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
				{/* Header */}
				<div className="flex items-center justify-between border-b border-border px-6 py-4">
					<h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
						<ImageIcon className="h-5 w-5 text-purple-500" />
						{title}
					</h2>
					<Button
						variant="ghost"
						size="icon"
						onClick={handleClose}
						className="text-muted-foreground hover:text-foreground"
					>
						<X className="h-5 w-5" />
					</Button>
				</div>

				{/* Content */}
				<div className="max-h-[calc(80vh-140px)] overflow-y-auto p-6">
					{isLoading && (
						<div className="flex items-center justify-center py-20">
							<Loader2 className="h-8 w-8 animate-spin text-primary" />
							<span className="ml-3 text-muted-foreground">
								Loading assets...
							</span>
						</div>
					)}

					{error && (
						<div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-destructive">
							Failed to load assets: {error.message}
						</div>
					)}

					{data?.success && data.images && data.images.length === 0 && (
						<div className="py-20 text-center text-muted-foreground">
							<ImageIcon className="mx-auto mb-3 h-12 w-12 opacity-50" />
							<p className="text-lg">No images available</p>
							<p className="mt-2 text-sm">
								Generate some images first to use them here
							</p>
						</div>
					)}

					{data?.success && data.images && data.images.length > 0 && (
						<div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
							{data.images.map((image) => (
								<button
									type="button"
									key={image.id}
									onClick={() => handleSelect(image)}
									className={`group relative overflow-hidden rounded-lg border-2 transition-all ${
										selectedId === image.id
											? "border-purple-500 ring-2 ring-purple-500/50"
											: "border-border hover:border-muted-foreground"
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
											className="flex w-full items-center justify-center bg-muted text-muted-foreground"
											style={{ aspectRatio: "9/16" }}
										>
											<ImageIcon className="h-6 w-6" />
										</div>
									)}

									{/* Selection indicator */}
									{selectedId === image.id && (
										<div className="absolute inset-0 flex items-center justify-center bg-purple-500/20">
											<div className="rounded-full bg-purple-500 p-2">
												<Check className="h-5 w-5 text-white" />
											</div>
										</div>
									)}

									{/* Hover overlay */}
									<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
										<div className="absolute bottom-0 left-0 right-0 p-2">
											<p className="line-clamp-2 text-xs text-white">
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
				<div className="flex items-center justify-end gap-3 border-t border-border bg-card/50 px-6 py-4">
					<Button variant="ghost" onClick={handleClose}>
						Cancel
					</Button>
					<Button
						onClick={handleConfirm}
						disabled={!selectedUrl}
						className="bg-purple-600 text-white hover:bg-purple-500"
					>
						Select Image
					</Button>
				</div>
			</div>
		</div>
	);
}
