import { eq, desc } from "drizzle-orm";
import { db } from "./index";
import { stories, scenes, type Story, type NewStory, type Scene, type NewScene } from "./schema";
import type { StoryMetadata, StorySceneMetadata } from "@/lib/cache";

// ============================================================================
// Story CRUD Operations
// ============================================================================

/**
 * Create a new story
 */
export function createStory(data: NewStory): Story {
	return db.insert(stories).values(data).returning().get();
}

/**
 * Get a story by ID
 */
export function getStoryById(id: string): Story | undefined {
	return db.select().from(stories).where(eq(stories.id, id)).get();
}

/**
 * Update a story
 */
export function updateStory(id: string, data: Partial<NewStory>): Story | undefined {
	return db
		.update(stories)
		.set({ ...data, updatedAt: new Date().toISOString() })
		.where(eq(stories.id, id))
		.returning()
		.get();
}

/**
 * Delete a story (cascades to scenes)
 */
export function deleteStoryById(id: string): void {
	// First delete scenes (for foreign key constraint)
	db.delete(scenes).where(eq(scenes.storyId, id)).run();
	// Then delete story
	db.delete(stories).where(eq(stories.id, id)).run();
}

/**
 * List all stories ordered by updatedAt desc
 */
export function listAllStoriesDb(): Story[] {
	return db.select().from(stories).orderBy(desc(stories.updatedAt)).all();
}

/**
 * List stories by type
 */
export function listStoriesByTypeDb(type: "aistory" | "podcast42"): Story[] {
	return db
		.select()
		.from(stories)
		.where(eq(stories.type, type))
		.orderBy(desc(stories.updatedAt))
		.all();
}

// ============================================================================
// Scene CRUD Operations
// ============================================================================

/**
 * Create a scene
 */
export function createScene(data: NewScene): Scene {
	return db.insert(scenes).values(data).returning().get();
}

/**
 * Create multiple scenes
 */
export function createScenes(data: NewScene[]): Scene[] {
	if (data.length === 0) return [];
	return db.insert(scenes).values(data).returning().all();
}

/**
 * Get scenes for a story ordered by orderIndex
 */
export function getScenesByStoryId(storyId: string): Scene[] {
	return db
		.select()
		.from(scenes)
		.where(eq(scenes.storyId, storyId))
		.orderBy(scenes.orderIndex)
		.all();
}

/**
 * Get a scene by ID
 */
export function getSceneById(id: string): Scene | undefined {
	return db.select().from(scenes).where(eq(scenes.id, id)).get();
}

/**
 * Update a scene
 */
export function updateScene(id: string, data: Partial<NewScene>): Scene | undefined {
	return db.update(scenes).set(data).where(eq(scenes.id, id)).returning().get();
}

/**
 * Delete a scene
 */
export function deleteSceneById(id: string): void {
	db.delete(scenes).where(eq(scenes.id, id)).run();
}

/**
 * Delete all scenes for a story
 */
export function deleteScenesByStoryId(storyId: string): void {
	db.delete(scenes).where(eq(scenes.storyId, storyId)).run();
}

// ============================================================================
// Conversion functions (DB <-> StoryMetadata)
// ============================================================================

/**
 * Convert DB Story + Scenes to StoryMetadata format
 */
export function dbToStoryMetadata(story: Story, storyScenes: Scene[]): StoryMetadata {
	const scenesMeta: StorySceneMetadata[] = storyScenes.map((scene) => ({
		id: scene.id,
		caption: scene.caption,
		title: scene.title ?? undefined,
		prompt: scene.prompt ?? undefined,
		video_prompt: scene.videoPrompt ?? undefined,
		isCharacter: scene.isCharacter ?? undefined,
		speaker: scene.speaker as "person1" | "person2" | undefined,
		imageUrl: scene.imageUrl ?? undefined,
		audioUrl: scene.audioUrl ?? undefined,
		videoUrl: scene.videoUrl ?? undefined,
		wordTimestamps: scene.wordTimestamps
			? (JSON.parse(scene.wordTimestamps) as Array<{ word: string; start: number; end: number }>)
			: undefined,
		audioDuration: scene.audioDuration ?? undefined,
		videoDuration: scene.videoDuration ?? undefined,
	}));

	return {
		storyId: story.id,
		type: story.type,
		createdAt: story.createdAt,
		updatedAt: story.updatedAt,
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
		characterFileId: story.characterFileId ?? undefined,
		characterImageUrl: story.characterImageUrl ?? undefined,
		hasCharacterImage: story.hasCharacterImage ?? undefined,
		person1Prompt: story.person1Prompt ?? undefined,
		person1ImageUrl: story.person1ImageUrl ?? undefined,
		hasPerson1Image: story.hasPerson1Image ?? undefined,
		person2Prompt: story.person2Prompt ?? undefined,
		person2ImageUrl: story.person2ImageUrl ?? undefined,
		hasPerson2Image: story.hasPerson2Image ?? undefined,
		hasExportedVideo: story.hasExportedVideo ?? undefined,
		scenes: scenesMeta,
	};
}

/**
 * Convert StoryMetadata to DB format for insert/update
 */
export function storyMetadataToDb(metadata: StoryMetadata): { story: NewStory; scenes: NewScene[] } {
	const story: NewStory = {
		id: metadata.storyId,
		type: metadata.type,
		createdAt: metadata.createdAt,
		updatedAt: metadata.updatedAt,
		script: metadata.script ?? null,
		playScript: metadata.playScript ?? null,
		imageEngine: metadata.imageEngine,
		imageStyle: metadata.imageStyle,
		voiceId: metadata.voiceId ?? null,
		person1VoiceId: metadata.person1VoiceId ?? null,
		person2VoiceId: metadata.person2VoiceId ?? null,
		videoEngine: metadata.videoEngine ?? null,
		podcast42VideoEngine: metadata.podcast42VideoEngine ?? null,
		characterPrompt: metadata.characterPrompt ?? null,
		characterFileId: metadata.characterFileId ?? null,
		characterImageUrl: metadata.characterImageUrl ?? null,
		hasCharacterImage: metadata.hasCharacterImage ?? null,
		person1Prompt: metadata.person1Prompt ?? null,
		person1ImageUrl: metadata.person1ImageUrl ?? null,
		hasPerson1Image: metadata.hasPerson1Image ?? null,
		person2Prompt: metadata.person2Prompt ?? null,
		person2ImageUrl: metadata.person2ImageUrl ?? null,
		hasPerson2Image: metadata.hasPerson2Image ?? null,
		hasExportedVideo: metadata.hasExportedVideo ?? null,
	};

	const dbScenes: NewScene[] = metadata.scenes.map((scene, index) => ({
		id: scene.id,
		storyId: metadata.storyId,
		orderIndex: index,
		caption: scene.caption,
		title: scene.title ?? null,
		prompt: scene.prompt ?? null,
		videoPrompt: scene.video_prompt ?? null,
		isCharacter: scene.isCharacter ?? null,
		speaker: scene.speaker ?? null,
		imageUrl: scene.imageUrl ?? null,
		audioUrl: scene.audioUrl ?? null,
		videoUrl: scene.videoUrl ?? null,
		wordTimestamps: scene.wordTimestamps ? JSON.stringify(scene.wordTimestamps) : null,
		audioDuration: scene.audioDuration ?? null,
		videoDuration: scene.videoDuration ?? null,
	}));

	return { story, scenes: dbScenes };
}

// ============================================================================
// High-level operations (matching cache.ts API)
// ============================================================================

/**
 * Save story metadata to database (create or update)
 */
export function saveStoryMetadataDb(metadata: StoryMetadata): void {
	const { story, scenes: scenesData } = storyMetadataToDb({
		...metadata,
		updatedAt: new Date().toISOString(),
	});

	// Check if story exists
	const existing = getStoryById(metadata.storyId);

	if (existing) {
		// Update story
		db.update(stories)
			.set(story)
			.where(eq(stories.id, metadata.storyId))
			.run();

		// Delete old scenes and insert new ones
		deleteScenesByStoryId(metadata.storyId);
		if (scenesData.length > 0) {
			createScenes(scenesData);
		}
	} else {
		// Create story
		createStory(story);
		if (scenesData.length > 0) {
			createScenes(scenesData);
		}
	}
}

/**
 * Load story metadata from database
 */
export function loadStoryMetadataDb(storyId: string): StoryMetadata | null {
	const story = getStoryById(storyId);
	if (!story) return null;

	const storyScenes = getScenesByStoryId(storyId);
	return dbToStoryMetadata(story, storyScenes);
}

/**
 * Check if story exists in database
 */
export function storyExistsDb(storyId: string): boolean {
	return getStoryById(storyId) !== undefined;
}

/**
 * List all stories as StoryMetadata
 */
export function listAllStoriesAsMetadata(): StoryMetadata[] {
	const allStories = listAllStoriesDb();
	return allStories.map((story) => {
		const storyScenes = getScenesByStoryId(story.id);
		return dbToStoryMetadata(story, storyScenes);
	});
}

/**
 * List stories by type as StoryMetadata
 */
export function listStoriesByTypeAsMetadata(type: "aistory" | "podcast42"): StoryMetadata[] {
	const typeStories = listStoriesByTypeDb(type);
	return typeStories.map((story) => {
		const storyScenes = getScenesByStoryId(story.id);
		return dbToStoryMetadata(story, storyScenes);
	});
}

/**
 * Delete a story from database
 */
export function deleteStoryDb(storyId: string): void {
	deleteStoryById(storyId);
}
