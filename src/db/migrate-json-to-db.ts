/**
 * Migration script: JSON metadata files -> SQLite database
 *
 * Run with: npx tsx src/db/migrate-json-to-db.ts
 *
 * This script reads all existing metadata.json files from
 * public/video_cache/stories/{storyId}/ and imports them into SQLite.
 *
 * It also converts old hasImage/hasAudio/hasVideo flags to URL format.
 */

import fs from "node:fs";
import path from "node:path";
import { saveStoryMetadataDb, storyExistsDb } from "./queries";
import type { StoryMetadata, StorySceneMetadata } from "@/lib/cache";

// Initialize database (this creates tables if they don't exist)
import "./index";

const CACHE_BASE_DIR = path.join(process.cwd(), "public/video_cache/stories");

// Old JSON format (with hasImage/hasAudio/hasVideo flags)
interface OldSceneMetadata {
	id: string;
	caption: string;
	title?: string;
	prompt?: string;
	video_prompt?: string;
	isCharacter?: boolean;
	speaker?: "person1" | "person2";
	wordTimestamps?: Array<{ word: string; start: number; end: number }>;
	audioDuration?: number;
	videoDuration?: number;
	// Old flags (to be converted to URLs)
	hasImage?: boolean;
	hasAudio?: boolean;
	hasVideo?: boolean;
}

interface OldStoryMetadata extends Omit<StoryMetadata, "scenes"> {
	scenes: OldSceneMetadata[];
}

/**
 * Convert old scene metadata (with flags) to new format (with URLs)
 */
function convertScene(
	scene: OldSceneMetadata,
	storyId: string,
	sceneIndex: number,
): StorySceneMetadata {
	const newScene: StorySceneMetadata = {
		id: scene.id,
		caption: scene.caption,
		title: scene.title,
		prompt: scene.prompt,
		video_prompt: scene.video_prompt,
		isCharacter: scene.isCharacter,
		speaker: scene.speaker,
		wordTimestamps: scene.wordTimestamps,
		audioDuration: scene.audioDuration,
		videoDuration: scene.videoDuration,
	};

	// Convert hasImage flag to imageUrl
	if (scene.hasImage) {
		const imagePath = path.join(CACHE_BASE_DIR, storyId, `scene-${sceneIndex}-image.jpg`);
		if (fs.existsSync(imagePath)) {
			newScene.imageUrl = `/video_cache/stories/${storyId}/scene-${sceneIndex}-image.jpg`;
		}
	}

	// Convert hasAudio flag to audioUrl
	if (scene.hasAudio) {
		const audioPath = path.join(CACHE_BASE_DIR, storyId, `scene-${sceneIndex}-audio.mp3`);
		if (fs.existsSync(audioPath)) {
			newScene.audioUrl = `/video_cache/stories/${storyId}/scene-${sceneIndex}-audio.mp3`;
		}
	}

	// Convert hasVideo flag to videoUrl
	if (scene.hasVideo) {
		const videoPath = path.join(CACHE_BASE_DIR, storyId, `scene-${sceneIndex}-video.mp4`);
		if (fs.existsSync(videoPath)) {
			newScene.videoUrl = `/video_cache/stories/${storyId}/scene-${sceneIndex}-video.mp4`;
		}
	}

	return newScene;
}

function migrateJsonToDb(): void {
	console.log("=== JSON to SQLite Migration ===\n");

	// Check if stories directory exists
	if (!fs.existsSync(CACHE_BASE_DIR)) {
		console.log("No stories directory found at:", CACHE_BASE_DIR);
		console.log("Nothing to migrate.");
		return;
	}

	// Get all story directories
	const dirs = fs.readdirSync(CACHE_BASE_DIR);
	console.log(`Found ${dirs.length} story directories\n`);

	let migrated = 0;
	let skipped = 0;
	let errors = 0;

	for (const dir of dirs) {
		const metadataPath = path.join(CACHE_BASE_DIR, dir, "metadata.json");

		// Skip if no metadata.json
		if (!fs.existsSync(metadataPath)) {
			console.log(`[SKIP] ${dir}: No metadata.json found`);
			skipped++;
			continue;
		}

		try {
			// Read JSON file
			const content = fs.readFileSync(metadataPath, "utf-8");
			const oldMetadata = JSON.parse(content) as OldStoryMetadata;

			// Check if already in database
			if (storyExistsDb(oldMetadata.storyId)) {
				console.log(`[SKIP] ${oldMetadata.storyId}: Already in database`);
				skipped++;
				continue;
			}

			// Convert scenes to new format
			const newScenes = oldMetadata.scenes.map((scene, index) =>
				convertScene(scene, oldMetadata.storyId, index),
			);

			// Create new metadata with converted scenes
			const newMetadata: StoryMetadata = {
				...oldMetadata,
				scenes: newScenes,
			};

			// Save to database
			saveStoryMetadataDb(newMetadata);
			console.log(`[OK] ${oldMetadata.storyId}: Migrated (${oldMetadata.type}, ${newScenes.length} scenes)`);
			migrated++;
		} catch (err) {
			console.error(`[ERROR] ${dir}:`, err instanceof Error ? err.message : err);
			errors++;
		}
	}

	console.log("\n=== Migration Complete ===");
	console.log(`Migrated: ${migrated}`);
	console.log(`Skipped: ${skipped}`);
	console.log(`Errors: ${errors}`);
}

// Run migration
migrateJsonToDb();
