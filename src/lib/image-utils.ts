/**
 * Image utility functions for thumbnail generation and image processing
 */

/**
 * Convert a Supabase Storage URL to a thumbnail URL using Image Transformation
 * Requires Supabase Pro plan with Image Transformations enabled
 *
 * @param originalUrl - The original Supabase Storage URL
 * @param width - Target width for the thumbnail (default: 200)
 * @returns The transformed thumbnail URL
 *
 * @example
 * // Original: https://xxx.supabase.co/storage/v1/object/public/images/image-xxx.jpg
 * // Thumbnail: https://xxx.supabase.co/storage/v1/render/image/public/images/image-xxx.jpg?width=200&resize=contain
 */
export function getThumbnailUrl(originalUrl: string, width = 200): string {
	if (!originalUrl) return "";

	// Check if it's a Supabase Storage URL
	if (!originalUrl.includes("supabase.co/storage/v1/object/")) {
		// Not a Supabase URL, return as-is
		return originalUrl;
	}

	// Replace /object/ with /render/image/ and add transformation params
	return (
		originalUrl.replace("/object/", "/render/image/") +
		`?width=${width}&resize=contain`
	);
}

/**
 * Get a medium-sized preview URL (for modals, detail views)
 * @param originalUrl - The original Supabase Storage URL
 * @param width - Target width (default: 400)
 */
export function getPreviewUrl(originalUrl: string, width = 400): string {
	return getThumbnailUrl(originalUrl, width);
}

/**
 * Convert a File to base64 string
 * @param file - The file to convert
 * @returns Promise<string> - Base64 encoded string (without data:image prefix)
 */
export function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			// Remove data:image/xxx;base64, prefix
			const base64 = result.split(",")[1];
			resolve(base64);
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

/**
 * Get image dimensions from a File
 * @param file - The image file
 * @returns Promise<{width: number, height: number}>
 */
export function getImageDimensions(
	file: File,
): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			resolve({ width: img.width, height: img.height });
		};
		img.onerror = reject;
		img.src = URL.createObjectURL(file);
	});
}

/**
 * Check if an image matches the target aspect ratio
 * @param width - Image width
 * @param height - Image height
 * @param targetRatio - Target aspect ratio (e.g., "9:16", "16:9")
 * @param tolerance - Allowed deviation (default: 0.05 = 5%)
 */
export function matchesAspectRatio(
	width: number,
	height: number,
	targetRatio: "9:16" | "16:9" | "1:1",
	tolerance = 0.05,
): boolean {
	const ratioMap = {
		"9:16": 9 / 16,
		"16:9": 16 / 9,
		"1:1": 1,
	};

	const imageRatio = width / height;
	const target = ratioMap[targetRatio];

	return Math.abs(imageRatio - target) / target <= tolerance;
}
