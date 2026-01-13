// Cache utility for saving generated assets with storyId-based naming
// All assets are stored server-side to avoid base64 encoding/decoding issues
// Metadata is stored in SQLite database, media files remain in filesystem

import fs from "node:fs";
import path from "node:path";
import {
	saveStoryMetadataDb,
	loadStoryMetadataDb,
	storyExistsDb,
	listAllStoriesAsMetadata,
	listStoriesByTypeAsMetadata,
	deleteStoryDb,
} from "@/db/queries";

// Base directory for all story assets
const CACHE_BASE_DIR = path.join(process.cwd(), "public/video_cache/stories");

// ============================================================================
// Story Metadata Types (for JSON persistence)
// ============================================================================

export interface StorySceneMetadata {
	id: string;
	caption: string;
	// For aistory
	title?: string;
	prompt?: string;
	video_prompt?: string;
	isCharacter?: boolean;
	// For podcast42
	speaker?: "person1" | "person2";
	// Media URLs (public URLs for frontend access)
	imageUrl?: string; // e.g., /video_cache/stories/{storyId}/scene-{index}-image.jpg
	audioUrl?: string; // e.g., /video_cache/stories/{storyId}/scene-{index}-audio.mp3
	videoUrl?: string; // e.g., /video_cache/stories/{storyId}/scene-{index}-video.mp4
	// Word timestamps for caption sync
	wordTimestamps?: Array<{ word: string; start: number; end: number }>;
	audioDuration?: number;
	videoDuration?: number;
}

export interface StoryMetadata {
	// Common fields
	storyId: string;
	type: "aistory" | "podcast42";
	createdAt: string;
	updatedAt: string;

	// Input
	script?: string; // for aistory
	playScript?: string; // for podcast42

	// Engine settings
	imageEngine: "gpt-image" | "flux-pro";
	imageStyle: "cinematic" | "comic" | "low-poly" | "japanese-anime" | "clay";
	voiceId?: string; // for aistory
	person1VoiceId?: string; // for podcast42
	person2VoiceId?: string; // for podcast42
	videoEngine?: string; // for aistory
	podcast42VideoEngine?: "omnihuman" | "aurora"; // for podcast42

	// Character data
	characterPrompt?: string; // for aistory
	characterFileId?: string; // OpenAI file ID
	characterImageUrl?: string; // FAL storage URL
	hasCharacterImage?: boolean;

	// Podcast42 specific
	person1Prompt?: string;
	person1ImageUrl?: string;
	hasPerson1Image?: boolean;
	person2Prompt?: string;
	person2ImageUrl?: string;
	hasPerson2Image?: boolean;

	// Scenes
	scenes: StorySceneMetadata[];

	// Export
	hasExportedVideo?: boolean;
}

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
 * Delete entire story (database record + media files directory)
 */
export function deleteStory(storyId: string): void {
	// Delete from database
	deleteStoryDb(storyId);
	console.log(`[cache] Deleted story from DB: ${storyId}`);

	// Delete media files directory
	const dir = path.join(CACHE_BASE_DIR, storyId);
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, { recursive: true, force: true });
		console.log(`[cache] Deleted story files: ${dir}`);
	}
}

// ============================================================================
// Database Metadata functions (SQLite with Drizzle ORM)
// ============================================================================

/**
 * Save story metadata to database
 */
export function saveStoryMetadata(metadata: StoryMetadata): void {
	// Also ensure story directory exists for media files
	ensureStoryDir(metadata.storyId);
	saveStoryMetadataDb(metadata);
	console.log(`[cache] Saved story metadata to DB: ${metadata.storyId}`);
}

/**
 * Load story metadata from database
 */
export function loadStoryMetadata(storyId: string): StoryMetadata | null {
	return loadStoryMetadataDb(storyId);
}

/**
 * Check if story metadata exists in database
 */
export function storyMetadataExists(storyId: string): boolean {
	return storyExistsDb(storyId);
}

/**
 * List all stories with metadata from database
 */
export function listAllStories(): StoryMetadata[] {
	return listAllStoriesAsMetadata();
}

/**
 * List stories by type from database
 */
export function listStoriesByType(
	type: "aistory" | "podcast42",
): StoryMetadata[] {
	return listStoriesByTypeAsMetadata(type);
}

// ============================================================================
// Podcast42-specific path/URL getters
// ============================================================================

/**
 * Get the absolute file path for person1 image (podcast42)
 */
export function getPerson1ImagePath(storyId: string): string {
	return path.join(CACHE_BASE_DIR, storyId, "person1.jpg");
}

/**
 * Get the absolute file path for person2 image (podcast42)
 */
export function getPerson2ImagePath(storyId: string): string {
	return path.join(CACHE_BASE_DIR, storyId, "person2.jpg");
}

/**
 * Get the public URL for person1 image (podcast42)
 */
export function getPerson1ImageUrl(storyId: string): string {
	return `/video_cache/stories/${storyId}/person1.jpg`;
}

/**
 * Get the public URL for person2 image (podcast42)
 */
export function getPerson2ImageUrl(storyId: string): string {
	return `/video_cache/stories/${storyId}/person2.jpg`;
}

/**
 * Save person1 image (podcast42)
 */
export function savePerson1Image(storyId: string, imageBuffer: Buffer): string {
	ensureStoryDir(storyId);
	const filePath = getPerson1ImagePath(storyId);
	fs.writeFileSync(filePath, imageBuffer);
	console.log(`[cache] Saved person1 image: ${filePath}`);
	return getPerson1ImageUrl(storyId);
}

/**
 * Save person2 image (podcast42)
 */
export function savePerson2Image(storyId: string, imageBuffer: Buffer): string {
	ensureStoryDir(storyId);
	const filePath = getPerson2ImagePath(storyId);
	fs.writeFileSync(filePath, imageBuffer);
	console.log(`[cache] Saved person2 image: ${filePath}`);
	return getPerson2ImageUrl(storyId);
}

/**
 * Check if person1 image exists
 */
export function person1ImageExists(storyId: string): boolean {
	return fs.existsSync(getPerson1ImagePath(storyId));
}

/**
 * Check if person2 image exists
 */
export function person2ImageExists(storyId: string): boolean {
	return fs.existsSync(getPerson2ImagePath(storyId));
}

/**
 * Read person1 image as base64
 */
export function readPerson1ImageBase64(storyId: string): string | null {
	const filePath = getPerson1ImagePath(storyId);
	if (!fs.existsSync(filePath)) return null;
	return fs.readFileSync(filePath).toString("base64");
}

/**
 * Read person2 image as base64
 */
export function readPerson2ImageBase64(storyId: string): string | null {
	const filePath = getPerson2ImagePath(storyId);
	if (!fs.existsSync(filePath)) return null;
	return fs.readFileSync(filePath).toString("base64");
}

/**
 * Read scene audio as base64
 */
export function readSceneAudioBase64(
	storyId: string,
	sceneIndex: number,
): string | null {
	const filePath = getSceneAudioPath(storyId, sceneIndex);
	if (!fs.existsSync(filePath)) return null;
	return fs.readFileSync(filePath).toString("base64");
}
