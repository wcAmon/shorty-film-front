// Cache utility for saving generated assets with storyId-based naming
// All assets are stored server-side to avoid base64 encoding/decoding issues

import fs from "node:fs";
import path from "node:path";

// Base directory for all story assets
const CACHE_BASE_DIR = path.join(process.cwd(), "public/video_cache/stories");

/**
 * Ensure story directory exists
 */
export function ensureStoryDir(storyId: string): string {
	const dir = path.join(CACHE_BASE_DIR, storyId);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	return dir;
}

/**
 * Generate a unique story ID
 */
export function generateStoryId(): string {
	return `story_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// File path getters (for reading files)
// ============================================================================

/**
 * Get the absolute file path for character image
 */
export function getCharacterImagePath(storyId: string): string {
	return path.join(CACHE_BASE_DIR, storyId, "character.jpg");
}

/**
 * Get the absolute file path for scene image
 */
export function getSceneImagePath(storyId: string, sceneIndex: number): string {
	return path.join(CACHE_BASE_DIR, storyId, `scene-${sceneIndex}-image.jpg`);
}

/**
 * Get the absolute file path for scene audio
 */
export function getSceneAudioPath(storyId: string, sceneIndex: number): string {
	return path.join(CACHE_BASE_DIR, storyId, `scene-${sceneIndex}-audio.mp3`);
}

/**
 * Get the absolute file path for scene video (raw from FAL, not merged)
 */
export function getSceneVideoRawPath(
	storyId: string,
	sceneIndex: number,
): string {
	return path.join(CACHE_BASE_DIR, storyId, `scene-${sceneIndex}-video-raw.mp4`);
}

/**
 * Get the absolute file path for scene video (merged with audio)
 */
export function getSceneVideoPath(storyId: string, sceneIndex: number): string {
	return path.join(CACHE_BASE_DIR, storyId, `scene-${sceneIndex}-video.mp4`);
}

/**
 * Get the absolute file path for exported video
 */
export function getExportedVideoPath(storyId: string): string {
	return path.join(CACHE_BASE_DIR, storyId, "export.mp4");
}

// ============================================================================
// URL getters (for frontend access)
// ============================================================================

/**
 * Get the public URL for character image
 */
export function getCharacterImageUrl(storyId: string): string {
	return `/video_cache/stories/${storyId}/character.jpg`;
}

/**
 * Get the public URL for scene image
 */
export function getSceneImageUrl(storyId: string, sceneIndex: number): string {
	return `/video_cache/stories/${storyId}/scene-${sceneIndex}-image.jpg`;
}

/**
 * Get the public URL for scene audio
 */
export function getSceneAudioUrl(storyId: string, sceneIndex: number): string {
	return `/video_cache/stories/${storyId}/scene-${sceneIndex}-audio.mp3`;
}

/**
 * Get the public URL for scene video
 */
export function getSceneVideoUrl(storyId: string, sceneIndex: number): string {
	return `/video_cache/stories/${storyId}/scene-${sceneIndex}-video.mp4`;
}

/**
 * Get the public URL for exported video
 */
export function getExportedVideoUrl(storyId: string): string {
	return `/video_cache/stories/${storyId}/export.mp4`;
}

// ============================================================================
// Save functions
// ============================================================================

/**
 * Save character image
 */
export function saveCharacterImage(
	storyId: string,
	imageBuffer: Buffer,
): string {
	ensureStoryDir(storyId);
	const filePath = getCharacterImagePath(storyId);
	fs.writeFileSync(filePath, imageBuffer);
	console.log(`[cache] Saved character image: ${filePath}`);
	return getCharacterImageUrl(storyId);
}

/**
 * Save scene image
 */
export function saveSceneImage(
	storyId: string,
	sceneIndex: number,
	imageBuffer: Buffer,
): string {
	ensureStoryDir(storyId);
	const filePath = getSceneImagePath(storyId, sceneIndex);
	fs.writeFileSync(filePath, imageBuffer);
	console.log(`[cache] Saved scene image: ${filePath}`);
	return getSceneImageUrl(storyId, sceneIndex);
}

/**
 * Save scene audio
 */
export function saveSceneAudio(
	storyId: string,
	sceneIndex: number,
	audioBuffer: Buffer,
): string {
	ensureStoryDir(storyId);
	const filePath = getSceneAudioPath(storyId, sceneIndex);
	fs.writeFileSync(filePath, audioBuffer);
	console.log(`[cache] Saved scene audio: ${filePath}`);
	return getSceneAudioUrl(storyId, sceneIndex);
}

/**
 * Save scene video (raw from FAL)
 */
export function saveSceneVideoRaw(
	storyId: string,
	sceneIndex: number,
	videoBuffer: Buffer,
): string {
	ensureStoryDir(storyId);
	const filePath = getSceneVideoRawPath(storyId, sceneIndex);
	fs.writeFileSync(filePath, videoBuffer);
	console.log(`[cache] Saved raw scene video: ${filePath}`);
	return filePath;
}

/**
 * Save scene video (merged with audio)
 */
export function saveSceneVideo(
	storyId: string,
	sceneIndex: number,
	videoBuffer: Buffer,
): string {
	ensureStoryDir(storyId);
	const filePath = getSceneVideoPath(storyId, sceneIndex);
	fs.writeFileSync(filePath, videoBuffer);
	console.log(`[cache] Saved merged scene video: ${filePath}`);
	return getSceneVideoUrl(storyId, sceneIndex);
}

// ============================================================================
// Check functions
// ============================================================================

/**
 * Check if character image exists
 */
export function characterImageExists(storyId: string): boolean {
	return fs.existsSync(getCharacterImagePath(storyId));
}

/**
 * Check if scene image exists
 */
export function sceneImageExists(storyId: string, sceneIndex: number): boolean {
	return fs.existsSync(getSceneImagePath(storyId, sceneIndex));
}

/**
 * Check if scene audio exists
 */
export function sceneAudioExists(storyId: string, sceneIndex: number): boolean {
	return fs.existsSync(getSceneAudioPath(storyId, sceneIndex));
}

/**
 * Check if scene video exists
 */
export function sceneVideoExists(storyId: string, sceneIndex: number): boolean {
	return fs.existsSync(getSceneVideoPath(storyId, sceneIndex));
}

/**
 * Check if exported video exists
 */
export function exportedVideoExists(storyId: string): boolean {
	return fs.existsSync(getExportedVideoPath(storyId));
}

// ============================================================================
// Read functions
// ============================================================================

/**
 * Read character image as base64 (for frontend display)
 */
export function readCharacterImageBase64(storyId: string): string | null {
	const filePath = getCharacterImagePath(storyId);
	if (!fs.existsSync(filePath)) return null;
	return fs.readFileSync(filePath).toString("base64");
}

/**
 * Read scene image as base64 (for frontend display)
 */
export function readSceneImageBase64(
	storyId: string,
	sceneIndex: number,
): string | null {
	const filePath = getSceneImagePath(storyId, sceneIndex);
	if (!fs.existsSync(filePath)) return null;
	return fs.readFileSync(filePath).toString("base64");
}

/**
 * Read scene video as base64 (for frontend display)
 */
export function readSceneVideoBase64(
	storyId: string,
	sceneIndex: number,
): string | null {
	const filePath = getSceneVideoPath(storyId, sceneIndex);
	if (!fs.existsSync(filePath)) return null;
	return fs.readFileSync(filePath).toString("base64");
}

// ============================================================================
// Cleanup functions
// ============================================================================

/**
 * Delete raw video file after merging
 */
export function deleteSceneVideoRaw(
	storyId: string,
	sceneIndex: number,
): void {
	const filePath = getSceneVideoRawPath(storyId, sceneIndex);
	if (fs.existsSync(filePath)) {
		fs.unlinkSync(filePath);
		console.log(`[cache] Deleted raw video: ${filePath}`);
	}
}

/**
 * Delete entire story directory
 */
export function deleteStory(storyId: string): void {
	const dir = path.join(CACHE_BASE_DIR, storyId);
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, { recursive: true, force: true });
		console.log(`[cache] Deleted story: ${dir}`);
	}
}
