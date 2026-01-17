import { supabase } from "@/db";

// Storage bucket names
export type StorageBucket = "audios" | "images" | "videos";

// ============================================================================
// Upload Functions
// ============================================================================

/**
 * Upload a file to Supabase Storage
 * @param bucket - The storage bucket (audios, images, videos)
 * @param path - The file path within the bucket (e.g., "{storyId}/{fileId}.mp3")
 * @param buffer - The file content as a Buffer
 * @param contentType - The MIME type of the file
 * @returns The public URL of the uploaded file
 */
export async function uploadToStorage(
	bucket: StorageBucket,
	path: string,
	buffer: Buffer,
	contentType: string,
): Promise<string> {
	const { data, error } = await supabase.storage
		.from(bucket)
		.upload(path, buffer, {
			contentType,
			upsert: true, // Overwrite if exists
		});

	if (error) {
		console.error(
			`[supabase-storage] Upload error to ${bucket}/${path}:`,
			error,
		);
		throw new Error(`Failed to upload to ${bucket}: ${error.message}`);
	}

	// Get the public URL
	const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);

	console.log(`[supabase-storage] Uploaded to ${bucket}/${path}`);
	return urlData.publicUrl;
}

/**
 * Upload an audio file to Supabase Storage
 * Naming convention: audio-{storyId}-{sceneId}.mp3
 */
export async function uploadAudio(
	storyId: string,
	sceneId: string,
	buffer: Buffer,
): Promise<string> {
	const path = `audio-${storyId}-${sceneId}.mp3`;
	return uploadToStorage("audios", path, buffer, "audio/mpeg");
}

/**
 * Upload an image file to Supabase Storage
 * Naming convention: image-{storyId}-{sceneId}-{timestamp}.{format}
 * For character images, sceneId can be "character", "person1", or "person2"
 * Uses unique timestamp to preserve old images when regenerating (for asset library)
 */
export async function uploadImage(
	storyId: string,
	sceneId: string,
	buffer: Buffer,
	format: "jpg" | "png" = "jpg",
): Promise<string> {
	const timestamp = Date.now();
	const path = `image-${storyId}-${sceneId}-${timestamp}.${format}`;
	const contentType = format === "png" ? "image/png" : "image/jpeg";
	return uploadToStorage("images", path, buffer, contentType);
}

/**
 * Upload a video file to Supabase Storage
 * Naming convention: video-{storyId}-{sceneId}-{timestamp}.mp4
 * Uses unique timestamp to preserve old videos when regenerating (for asset library)
 */
export async function uploadVideo(
	storyId: string,
	sceneId: string,
	buffer: Buffer,
): Promise<string> {
	const timestamp = Date.now();
	const path = `video-${storyId}-${sceneId}-${timestamp}.mp4`;
	return uploadToStorage("videos", path, buffer, "video/mp4");
}

/**
 * Upload an exported video file to Supabase Storage
 * Naming convention: export-{storyId}.mp4
 */
export async function uploadExportVideo(
	storyId: string,
	buffer: Buffer,
): Promise<string> {
	const path = `export-${storyId}.mp4`;
	return uploadToStorage("videos", path, buffer, "video/mp4");
}

/**
 * Delete an exported video file from Supabase Storage
 */
export async function deleteExportVideo(storyId: string): Promise<void> {
	const path = `export-${storyId}.mp4`;
	try {
		await deleteFromStorage("videos", path);
	} catch (err) {
		// Ignore error if file doesn't exist
		console.log(
			`[supabase-storage] Export video not found, skipping delete: ${path}`,
		);
	}
}

// ============================================================================
// Download Functions
// ============================================================================

/**
 * Download a file from Supabase Storage
 * @param bucket - The storage bucket
 * @param path - The file path within the bucket
 * @returns The file content as a Buffer
 */
export async function downloadFromStorage(
	bucket: StorageBucket,
	path: string,
): Promise<Buffer> {
	const { data, error } = await supabase.storage.from(bucket).download(path);

	if (error) {
		console.error(
			`[supabase-storage] Download error from ${bucket}/${path}:`,
			error,
		);
		throw new Error(`Failed to download from ${bucket}: ${error.message}`);
	}

	// Convert Blob to Buffer
	const arrayBuffer = await data.arrayBuffer();
	return Buffer.from(arrayBuffer);
}

/**
 * Download an audio file from Supabase Storage
 * Naming convention: audio-{storyId}-{sceneId}.mp3
 */
export async function downloadAudio(
	storyId: string,
	sceneId: string,
): Promise<Buffer> {
	const path = `audio-${storyId}-${sceneId}.mp3`;
	return downloadFromStorage("audios", path);
}

/**
 * Download an image file from Supabase Storage
 * Naming convention: image-{storyId}-{sceneId}.{format}
 */
export async function downloadImage(
	storyId: string,
	sceneId: string,
	format: "jpg" | "png" = "jpg",
): Promise<Buffer> {
	const path = `image-${storyId}-${sceneId}.${format}`;
	return downloadFromStorage("images", path);
}

/**
 * Download a video file from Supabase Storage
 * Naming convention: video-{storyId}-{sceneId}.mp4
 */
export async function downloadVideo(
	storyId: string,
	sceneId: string,
): Promise<Buffer> {
	const path = `video-${storyId}-${sceneId}.mp4`;
	return downloadFromStorage("videos", path);
}

/**
 * Download an exported video file from Supabase Storage
 */
export async function downloadExportVideo(storyId: string): Promise<Buffer> {
	const path = `export-${storyId}.mp4`;
	return downloadFromStorage("videos", path);
}

// ============================================================================
// Delete Functions
// ============================================================================

/**
 * Delete a file from Supabase Storage
 * @param bucket - The storage bucket
 * @param path - The file path within the bucket
 */
export async function deleteFromStorage(
	bucket: StorageBucket,
	path: string,
): Promise<void> {
	const { error } = await supabase.storage.from(bucket).remove([path]);

	if (error) {
		console.error(
			`[supabase-storage] Delete error from ${bucket}/${path}:`,
			error,
		);
		throw new Error(`Failed to delete from ${bucket}: ${error.message}`);
	}

	console.log(`[supabase-storage] Deleted ${bucket}/${path}`);
}

/**
 * Delete multiple files from Supabase Storage
 * @param bucket - The storage bucket
 * @param paths - Array of file paths within the bucket
 */
export async function deleteMultipleFromStorage(
	bucket: StorageBucket,
	paths: string[],
): Promise<void> {
	if (paths.length === 0) return;

	const { error } = await supabase.storage.from(bucket).remove(paths);

	if (error) {
		console.error(`[supabase-storage] Delete error from ${bucket}:`, error);
		throw new Error(`Failed to delete from ${bucket}: ${error.message}`);
	}

	console.log(
		`[supabase-storage] Deleted ${paths.length} files from ${bucket}`,
	);
}

/**
 * Delete all files for a story from a bucket
 * Files are named: {type}-{storyId}-{sceneId}.{ext}
 * @param bucket - The storage bucket
 * @param storyId - The story ID to match in filenames
 */
export async function deleteStoryFiles(
	bucket: StorageBucket,
	storyId: string,
): Promise<void> {
	// Determine the media type prefix based on bucket
	const mediaType =
		bucket === "audios" ? "audio" : bucket === "images" ? "image" : "video";

	// List all files in the bucket root
	const { data: files, error: listError } = await supabase.storage
		.from(bucket)
		.list("");

	if (listError) {
		console.error(`[supabase-storage] List error for ${bucket}:`, listError);
		return;
	}

	if (!files || files.length === 0) {
		console.log(`[supabase-storage] No files in ${bucket}`);
		return;
	}

	// Filter files that match the pattern: {mediaType}-{storyId}-*
	const prefix = `${mediaType}-${storyId}-`;
	const exportPrefix = `export-${storyId}.`;
	const matchingFiles = files.filter(
		(file) =>
			file.name.startsWith(prefix) || file.name.startsWith(exportPrefix),
	);

	if (matchingFiles.length === 0) {
		console.log(
			`[supabase-storage] No files to delete for story ${storyId} in ${bucket}`,
		);
		return;
	}

	// Delete matching files
	const paths = matchingFiles.map((file) => file.name);
	await deleteMultipleFromStorage(bucket, paths);
}

// ============================================================================
// URL Helpers
// ============================================================================

/**
 * Get the public URL for a file in Supabase Storage
 */
export function getPublicUrl(bucket: StorageBucket, path: string): string {
	const { data } = supabase.storage.from(bucket).getPublicUrl(path);
	return data.publicUrl;
}

/**
 * Extract the storage path from a Supabase Storage URL
 * @param url - The full Supabase Storage URL
 * @returns The path within the bucket, or null if not a valid URL
 */
export function extractPathFromUrl(url: string): string | null {
	try {
		const urlObj = new URL(url);
		// URL format: /storage/v1/object/public/{bucket}/{path}
		const match = urlObj.pathname.match(
			/\/storage\/v1\/object\/public\/[^/]+\/(.+)/,
		);
		return match ? match[1] : null;
	} catch {
		return null;
	}
}

/**
 * Check if a file exists in Supabase Storage
 * For flat naming convention (no directories)
 */
export async function fileExists(
	bucket: StorageBucket,
	filename: string,
): Promise<boolean> {
	const { data, error } = await supabase.storage.from(bucket).list("", {
		search: filename,
	});

	if (error) {
		return false;
	}

	return data.some((file) => file.name === filename);
}

/**
 * Delete a specific scene's media file
 */
export async function deleteSceneMedia(
	bucket: StorageBucket,
	storyId: string,
	sceneId: string,
): Promise<void> {
	const mediaType =
		bucket === "audios" ? "audio" : bucket === "images" ? "image" : "video";
	const ext = bucket === "audios" ? "mp3" : bucket === "images" ? "jpg" : "mp4";
	const path = `${mediaType}-${storyId}-${sceneId}.${ext}`;

	try {
		await deleteFromStorage(bucket, path);
	} catch (err) {
		// Ignore error if file doesn't exist
		console.log(`[supabase-storage] File not found, skipping delete: ${path}`);
	}
}
