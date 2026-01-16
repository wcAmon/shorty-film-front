// Cache utility - now uses Supabase Storage instead of local filesystem
// ID generation is in src/db/index.ts
// Storage operations are in src/lib/supabase-storage.ts
// Database operations are in src/db/queries.ts

import fs from "node:fs";
import path from "node:path";
import { generateStoryId as genStoryId } from "@/db";
import {
	deleteStoryById,
	listAllStories as listAllStoriesDb,
	listStoriesByType as listStoriesByTypeDb,
	getScenesByStoryId,
	getStoryById,
} from "@/db/queries";
import type { Story, Scene } from "@/db/schema";
import {
	deleteStoryFiles as deleteStorageStoryFiles,
} from "@/lib/supabase-storage";

// Re-export for backward compatibility
export const generateStoryId = genStoryId;

// Base directory for temporary files (used during FFmpeg processing)
const TEMP_DIR = path.join(process.cwd(), "temp");

// ============================================================================
// Story Metadata Types (for backward compatibility during migration)
// ============================================================================

export interface StorySceneMetadata {
	id: string;
	caption?: string;
	// For aistory
	title?: string;
	prompt?: string;
	video_prompt?: string;
	isCharacter?: boolean;
	// For podcast42
	speaker?: "person1" | "person2";
	// Media IDs (new)
	imageId?: string;
	audioId?: string;
	videoId?: string;
	// Media URLs (Supabase Storage URLs)
	imageUrl?: string;
	audioUrl?: string;
	videoUrl?: string;
	// Word timestamps for caption sync
	wordTimestamps?: Array<{ word: string; start: number; end: number }>;
	audioDuration?: number;
	videoDuration?: number;
	// Status flags (from list API)
	hasAudio?: boolean;
	hasVideo?: boolean;
}

export interface StoryMetadata {
	// Common fields
	storyId: string;
	type: "aistory" | "podcast42" | string;
	createdAt: string;
	updatedAt: string;

	// Input
	script?: string | null; // for aistory
	playScript?: string | null; // for podcast42

	// Engine settings
	imageEngine?: "gpt-image" | "flux-pro" | string | null;
	imageStyle?: "cinematic" | "comic" | "low-poly" | "japanese-anime" | "clay" | string | null;
	voiceId?: string | null; // for aistory
	person1VoiceId?: string | null; // for podcast42
	person2VoiceId?: string | null; // for podcast42
	videoEngine?: string | null; // for aistory
	podcast42VideoEngine?: "omnihuman" | "aurora" | string | null; // for podcast42

	// Character data (new: IDs instead of URLs)
	characterPrompt?: string | null; // for aistory
	characterImageId?: string | null; // Image ID for character
	characterImageUrl?: string | null; // Supabase Storage URL

	// Legacy fields (deprecated)
	characterFileId?: string | null; // OpenAI file ID (deprecated)
	hasCharacterImage?: boolean;

	// Podcast42 specific
	person1Prompt?: string | null;
	person1ImageId?: string | null;
	person1ImageUrl?: string | null;
	hasPerson1Image?: boolean;
	person2Prompt?: string | null;
	person2ImageId?: string | null;
	person2ImageUrl?: string | null;
	hasPerson2Image?: boolean;

	// Scenes (optional for list API which only includes scene stats)
	scenes?: StorySceneMetadata[];

	// Export
	hasExportedVideo?: boolean;
	exportedVideoUrl?: string | null;
}

// ============================================================================
// Word Timestamp Types
// ============================================================================

export interface WordTimestamp {
	word: string;
	start: number;
	end: number;
}

// ============================================================================
// Temporary Directory Functions (for FFmpeg processing)
// ============================================================================

/**
 * Ensure temp directory exists
 */
export function ensureTempDir(): string {
	if (!fs.existsSync(TEMP_DIR)) {
		fs.mkdirSync(TEMP_DIR, { recursive: true });
	}
	return TEMP_DIR;
}

/**
 * Get a temporary file path
 */
export function getTempFilePath(filename: string): string {
	ensureTempDir();
	return path.join(TEMP_DIR, filename);
}

/**
 * Clean up a temporary file
 */
export function deleteTempFile(filename: string): void {
	const filePath = path.join(TEMP_DIR, filename);
	try {
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
			console.log(`[cache] Deleted temp file: ${filePath}`);
		}
	} catch (err) {
		console.error(`[cache] Failed to delete temp file ${filePath}:`, err);
	}
}

/**
 * Write a buffer to a temporary file
 */
export function writeTempFile(filename: string, buffer: Buffer): string {
	const filePath = getTempFilePath(filename);
	fs.writeFileSync(filePath, buffer);
	console.log(`[cache] Wrote temp file: ${filePath}`);
	return filePath;
}

/**
 * Read a temporary file
 */
export function readTempFile(filename: string): Buffer | null {
	const filePath = path.join(TEMP_DIR, filename);
	if (!fs.existsSync(filePath)) return null;
	return fs.readFileSync(filePath);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse word timestamps from JSON string
 */
export function parseWordTimestamps(json: string | null): WordTimestamp[] {
	if (!json) return [];
	try {
		return JSON.parse(json) as WordTimestamp[];
	} catch {
		return [];
	}
}

/**
 * Stringify word timestamps to JSON
 */
export function stringifyWordTimestamps(timestamps: WordTimestamp[]): string {
	return JSON.stringify(timestamps);
}

/**
 * Generate a unique ID with optional prefix
 */
export function generateId(prefix = ""): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).slice(2, 8);
	return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

// ============================================================================
// Story Operations (Async wrappers for backward compatibility)
// ============================================================================

/**
 * Delete entire story (database record + Supabase storage files)
 */
export async function deleteStory(storyId: string): Promise<void> {
	// Delete from database (cascades to scenes)
	await deleteStoryById(storyId);
	console.log(`[cache] Deleted story from DB: ${storyId}`);

	// Delete files from Supabase Storage
	try {
		await Promise.all([
			deleteStorageStoryFiles("images", storyId),
			deleteStorageStoryFiles("audios", storyId),
			deleteStorageStoryFiles("videos", storyId),
		]);
		console.log(`[cache] Deleted story files from Supabase: ${storyId}`);
	} catch (err) {
		console.error(`[cache] Error deleting storage files:`, err);
	}
}

/**
 * Convert DB Story + Scenes to StoryMetadata format
 */
export function dbToStoryMetadata(story: Story, storyScenes: Scene[]): StoryMetadata {
	const scenes: StorySceneMetadata[] = storyScenes.map((scene) => ({
		id: scene.id,
		caption: scene.caption,
		title: scene.title ?? undefined,
		prompt: scene.prompt ?? undefined,
		video_prompt: scene.videoPrompt ?? undefined,
		isCharacter: scene.isCharacter ?? undefined,
		speaker: scene.speaker as "person1" | "person2" | undefined,
		imageId: scene.imageId ?? undefined,
		audioId: scene.audioId ?? undefined,
		videoId: scene.videoId ?? undefined,
	}));

	return {
		storyId: story.id,
		type: story.type,
		createdAt: story.createdAt?.toISOString() ?? new Date().toISOString(),
		updatedAt: story.updatedAt?.toISOString() ?? new Date().toISOString(),
		script: story.script ?? undefined,
		playScript: story.playScript ?? undefined,
		imageEngine: story.imageEngine as "gpt-image" | "flux-pro",
		imageStyle: story.imageStyle as "cinematic" | "comic" | "low-poly" | "japanese-anime" | "clay",
		voiceId: story.voiceId ?? undefined,
		person1VoiceId: story.person1VoiceId ?? undefined,
		person2VoiceId: story.person2VoiceId ?? undefined,
		videoEngine: story.videoEngine ?? undefined,
		podcast42VideoEngine: story.podcast42VideoEngine as "omnihuman" | "aurora" | undefined,
		characterPrompt: story.characterPrompt ?? undefined,
		person1Prompt: story.person1Prompt ?? undefined,
		person2Prompt: story.person2Prompt ?? undefined,
		hasExportedVideo: story.hasExportedVideo ?? undefined,
		scenes,
	};
}

/**
 * Load story metadata from database
 */
export async function loadStoryMetadata(storyId: string): Promise<StoryMetadata | null> {
	const story = await getStoryById(storyId);
	if (!story) return null;

	const storyScenes = await getScenesByStoryId(storyId);
	return dbToStoryMetadata(story, storyScenes);
}

/**
 * List all stories as StoryMetadata
 */
export async function listAllStories(): Promise<StoryMetadata[]> {
	const stories = await listAllStoriesDb();
	const results = await Promise.all(
		stories.map(async (story) => {
			const storyScenes = await getScenesByStoryId(story.id);
			return dbToStoryMetadata(story, storyScenes);
		}),
	);
	return results;
}

/**
 * List stories by type as StoryMetadata
 */
export async function listStoriesByType(
	type: "aistory" | "podcast42",
): Promise<StoryMetadata[]> {
	const stories = await listStoriesByTypeDb(type);
	const results = await Promise.all(
		stories.map(async (story) => {
			const storyScenes = await getScenesByStoryId(story.id);
			return dbToStoryMetadata(story, storyScenes);
		}),
	);
	return results;
}
