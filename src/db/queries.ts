import { and, desc, eq, isNull } from "drizzle-orm";
import {
	db,
	generateAudioId,
	generateImageId,
	generateSceneId,
	generateStoryId,
	generateVideoId,
} from "./index";
import {
	type Audio,
	audios,
	type Image,
	type ImageType,
	images,
	type MediaStatus,
	type NewAudio,
	type NewImage,
	type NewScene,
	type NewStory,
	type NewVideo,
	type Scene,
	type Story,
	scenes,
	stories,
	type Video,
	videos,
} from "./schema";

// Re-export ID generators for convenience
export {
	generateStoryId,
	generateAudioId,
	generateImageId,
	generateVideoId,
	generateSceneId,
};

// ============================================================================
// Story CRUD Operations
// ============================================================================

/**
 * Create a new story
 */
export async function createStory(data: NewStory): Promise<Story> {
	const [result] = await db.insert(stories).values(data).returning();
	return result;
}

/**
 * Get a story by ID
 */
export async function getStoryById(id: string): Promise<Story | undefined> {
	const [result] = await db.select().from(stories).where(eq(stories.id, id));
	return result;
}

/**
 * Update a story
 */
export async function updateStory(
	id: string,
	data: Partial<NewStory>,
): Promise<Story | undefined> {
	const [result] = await db
		.update(stories)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(stories.id, id))
		.returning();
	return result;
}

/**
 * Delete a story (cascades to scenes via FK)
 */
export async function deleteStoryById(id: string): Promise<void> {
	await db.delete(stories).where(eq(stories.id, id));
}

/**
 * List all stories ordered by updatedAt desc
 */
export async function listAllStories(): Promise<Story[]> {
	return db.select().from(stories).orderBy(desc(stories.updatedAt));
}

/**
 * List stories by type
 */
export async function listStoriesByType(
	type: "aistory" | "podcast42",
): Promise<Story[]> {
	return db
		.select()
		.from(stories)
		.where(eq(stories.type, type))
		.orderBy(desc(stories.updatedAt));
}

// ============================================================================
// Scene CRUD Operations
// ============================================================================

/**
 * Create a scene
 */
export async function createScene(data: NewScene): Promise<Scene> {
	const [result] = await db.insert(scenes).values(data).returning();
	return result;
}

/**
 * Create multiple scenes
 */
export async function createScenes(data: NewScene[]): Promise<Scene[]> {
	if (data.length === 0) return [];
	return db.insert(scenes).values(data).returning();
}

/**
 * Get scenes for a story ordered by orderIndex
 */
export async function getScenesByStoryId(storyId: string): Promise<Scene[]> {
	return db
		.select()
		.from(scenes)
		.where(eq(scenes.storyId, storyId))
		.orderBy(scenes.orderIndex);
}

/**
 * Get a scene by ID
 */
export async function getSceneById(id: string): Promise<Scene | undefined> {
	const [result] = await db.select().from(scenes).where(eq(scenes.id, id));
	return result;
}

/**
 * Update a scene
 */
export async function updateScene(
	id: string,
	data: Partial<NewScene>,
): Promise<Scene | undefined> {
	const [result] = await db
		.update(scenes)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(scenes.id, id))
		.returning();
	return result;
}

/**
 * Delete a scene
 */
export async function deleteSceneById(id: string): Promise<void> {
	await db.delete(scenes).where(eq(scenes.id, id));
}

/**
 * Delete all scenes for a story
 */
export async function deleteScenesByStoryId(storyId: string): Promise<void> {
	await db.delete(scenes).where(eq(scenes.storyId, storyId));
}

// ============================================================================
// Audio CRUD Operations
// ============================================================================

/**
 * Create an audio record
 */
export async function createAudio(data: NewAudio): Promise<Audio> {
	const [result] = await db.insert(audios).values(data).returning();
	return result;
}

/**
 * Get an audio by ID
 */
export async function getAudioById(id: string): Promise<Audio | undefined> {
	const [result] = await db.select().from(audios).where(eq(audios.id, id));
	return result;
}

/**
 * Update an audio
 */
export async function updateAudio(
	id: string,
	data: Partial<NewAudio>,
): Promise<Audio | undefined> {
	const [result] = await db
		.update(audios)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(audios.id, id))
		.returning();
	return result;
}

/**
 * Update audio status
 */
export async function updateAudioStatus(
	id: string,
	status: MediaStatus,
): Promise<Audio | undefined> {
	return updateAudio(id, { status });
}

/**
 * Orphan an audio (set storyId and sceneId to null)
 * Used when regenerating to keep old media for asset library
 */
export async function orphanAudio(id: string): Promise<Audio | undefined> {
	const [result] = await db
		.update(audios)
		.set({ storyId: null, sceneId: null, updatedAt: new Date() })
		.where(eq(audios.id, id))
		.returning();
	return result;
}

/**
 * Get audios for a story
 */
export async function getAudiosByStoryId(storyId: string): Promise<Audio[]> {
	return db.select().from(audios).where(eq(audios.storyId, storyId));
}

/**
 * Get orphaned audios (storyId is null)
 */
export async function getOrphanedAudios(): Promise<Audio[]> {
	return db.select().from(audios).where(isNull(audios.storyId));
}

/**
 * Delete an audio by ID
 */
export async function deleteAudioById(id: string): Promise<void> {
	await db.delete(audios).where(eq(audios.id, id));
}

// ============================================================================
// Image CRUD Operations
// ============================================================================

/**
 * Create an image record
 */
export async function createImage(data: NewImage): Promise<Image> {
	const [result] = await db.insert(images).values(data).returning();
	return result;
}

/**
 * Get an image by ID
 */
export async function getImageById(id: string): Promise<Image | undefined> {
	const [result] = await db.select().from(images).where(eq(images.id, id));
	return result;
}

/**
 * Update an image
 */
export async function updateImage(
	id: string,
	data: Partial<NewImage>,
): Promise<Image | undefined> {
	const [result] = await db
		.update(images)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(images.id, id))
		.returning();
	return result;
}

/**
 * Update image status
 */
export async function updateImageStatus(
	id: string,
	status: MediaStatus,
): Promise<Image | undefined> {
	return updateImage(id, { status });
}

/**
 * Orphan an image (set storyId and sceneId to null)
 */
export async function orphanImage(id: string): Promise<Image | undefined> {
	const [result] = await db
		.update(images)
		.set({ storyId: null, sceneId: null, updatedAt: new Date() })
		.where(eq(images.id, id))
		.returning();
	return result;
}

/**
 * Get images for a story
 */
export async function getImagesByStoryId(storyId: string): Promise<Image[]> {
	return db.select().from(images).where(eq(images.storyId, storyId));
}

/**
 * Get character image for a story
 */
export async function getCharacterImage(
	storyId: string,
	imageType: ImageType = "character",
): Promise<Image | undefined> {
	const [result] = await db
		.select()
		.from(images)
		.where(and(eq(images.storyId, storyId), eq(images.imageType, imageType)));
	return result;
}

/**
 * Get orphaned images (storyId is null)
 */
export async function getOrphanedImages(): Promise<Image[]> {
	return db.select().from(images).where(isNull(images.storyId));
}

/**
 * Delete an image by ID
 */
export async function deleteImageById(id: string): Promise<void> {
	await db.delete(images).where(eq(images.id, id));
}

// ============================================================================
// Video CRUD Operations
// ============================================================================

/**
 * Create a video record
 */
export async function createVideo(data: NewVideo): Promise<Video> {
	const [result] = await db.insert(videos).values(data).returning();
	return result;
}

/**
 * Get a video by ID
 */
export async function getVideoById(id: string): Promise<Video | undefined> {
	const [result] = await db.select().from(videos).where(eq(videos.id, id));
	return result;
}

/**
 * Update a video
 */
export async function updateVideo(
	id: string,
	data: Partial<NewVideo>,
): Promise<Video | undefined> {
	const [result] = await db
		.update(videos)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(videos.id, id))
		.returning();
	return result;
}

/**
 * Update video status
 */
export async function updateVideoStatus(
	id: string,
	status: MediaStatus,
): Promise<Video | undefined> {
	return updateVideo(id, { status });
}

/**
 * Orphan a video (set storyId and sceneId to null)
 */
export async function orphanVideo(id: string): Promise<Video | undefined> {
	const [result] = await db
		.update(videos)
		.set({ storyId: null, sceneId: null, updatedAt: new Date() })
		.where(eq(videos.id, id))
		.returning();
	return result;
}

/**
 * Get videos for a story
 */
export async function getVideosByStoryId(storyId: string): Promise<Video[]> {
	return db.select().from(videos).where(eq(videos.storyId, storyId));
}

/**
 * Get orphaned videos (storyId is null)
 */
export async function getOrphanedVideos(): Promise<Video[]> {
	return db.select().from(videos).where(isNull(videos.storyId));
}

/**
 * Delete a video by ID
 */
export async function deleteVideoById(id: string): Promise<void> {
	await db.delete(videos).where(eq(videos.id, id));
}

// ============================================================================
// Scene Media Operations
// ============================================================================

/**
 * Update scene's image reference (and optionally orphan old image)
 */
export async function updateSceneImage(
	sceneId: string,
	newImageId: string,
	orphanOld = true,
): Promise<void> {
	const scene = await getSceneById(sceneId);
	if (!scene) return;

	// Orphan old image if exists
	if (orphanOld && scene.imageId) {
		await orphanImage(scene.imageId);
	}

	// Update scene with new image
	await updateScene(sceneId, { imageId: newImageId });
}

/**
 * Update scene's audio reference (and optionally orphan old audio)
 */
export async function updateSceneAudio(
	sceneId: string,
	newAudioId: string,
	orphanOld = true,
): Promise<void> {
	const scene = await getSceneById(sceneId);
	if (!scene) return;

	// Orphan old audio if exists
	if (orphanOld && scene.audioId) {
		await orphanAudio(scene.audioId);
	}

	// Update scene with new audio
	await updateScene(sceneId, { audioId: newAudioId });
}

/**
 * Update scene's audio reference and DELETE old audio record
 * Used when regenerating audio to clean up old records
 * (Storage files are automatically overwritten due to upsert: true)
 */
export async function replaceSceneAudio(
	sceneId: string,
	newAudioId: string,
): Promise<void> {
	const scene = await getSceneById(sceneId);
	if (!scene) return;

	// Delete old audio record if exists
	if (scene.audioId) {
		await deleteAudioById(scene.audioId);
	}

	// Update scene with new audio
	await updateScene(sceneId, { audioId: newAudioId });
}

/**
 * Update scene's video reference (and optionally orphan old video)
 */
export async function updateSceneVideo(
	sceneId: string,
	newVideoId: string,
	orphanOld = true,
): Promise<void> {
	const scene = await getSceneById(sceneId);
	if (!scene) return;

	// Orphan old video if exists
	if (orphanOld && scene.videoId) {
		await orphanVideo(scene.videoId);
	}

	// Update scene with new video
	await updateScene(sceneId, { videoId: newVideoId });
}

// ============================================================================
// Full Scene with Media
// ============================================================================

/**
 * Get a scene with its related media
 */
export async function getSceneWithMedia(sceneId: string): Promise<{
	scene: Scene;
	image?: Image;
	audio?: Audio;
	video?: Video;
} | null> {
	const scene = await getSceneById(sceneId);
	if (!scene) return null;

	const [image, audio, video] = await Promise.all([
		scene.imageId ? getImageById(scene.imageId) : undefined,
		scene.audioId ? getAudioById(scene.audioId) : undefined,
		scene.videoId ? getVideoById(scene.videoId) : undefined,
	]);

	return { scene, image, audio, video };
}

/**
 * Get all scenes for a story with their media
 */
export async function getScenesWithMedia(storyId: string): Promise<
	Array<{
		scene: Scene;
		image?: Image;
		audio?: Audio;
		video?: Video;
	}>
> {
	const storyScenes = await getScenesByStoryId(storyId);

	return Promise.all(
		storyScenes.map(async (scene) => {
			const [image, audio, video] = await Promise.all([
				scene.imageId ? getImageById(scene.imageId) : undefined,
				scene.audioId ? getAudioById(scene.audioId) : undefined,
				scene.videoId ? getVideoById(scene.videoId) : undefined,
			]);
			return { scene, image, audio, video };
		}),
	);
}

// ============================================================================
// Story Check
// ============================================================================

/**
 * Check if a story exists
 */
export async function storyExists(storyId: string): Promise<boolean> {
	const story = await getStoryById(storyId);
	return story !== undefined;
}

// ============================================================================
// User-Scoped Queries (for authenticated users)
// ============================================================================

/**
 * List all stories for a specific user
 */
export async function listUserStories(ownerId: string): Promise<Story[]> {
	return db
		.select()
		.from(stories)
		.where(eq(stories.ownerId, ownerId))
		.orderBy(desc(stories.updatedAt));
}

/**
 * List user's stories by type
 */
export async function listUserStoriesByType(
	ownerId: string,
	type: "aistory" | "podcast42",
): Promise<Story[]> {
	return db
		.select()
		.from(stories)
		.where(and(eq(stories.ownerId, ownerId), eq(stories.type, type)))
		.orderBy(desc(stories.updatedAt));
}

/**
 * Get ALL images for a user (not just orphaned)
 */
export async function getUserImages(ownerId: string): Promise<Image[]> {
	return db
		.select()
		.from(images)
		.where(eq(images.ownerId, ownerId))
		.orderBy(desc(images.createdAt));
}

/**
 * Get ALL videos for a user (not just orphaned)
 */
export async function getUserVideos(ownerId: string): Promise<Video[]> {
	return db
		.select()
		.from(videos)
		.where(eq(videos.ownerId, ownerId))
		.orderBy(desc(videos.createdAt));
}

/**
 * Verify user owns a story
 */
export async function verifyStoryOwnership(
	storyId: string,
	ownerId: string,
): Promise<boolean> {
	const [story] = await db
		.select({ id: stories.id })
		.from(stories)
		.where(and(eq(stories.id, storyId), eq(stories.ownerId, ownerId)));
	return !!story;
}

/**
 * Verify user owns a scene
 */
export async function verifySceneOwnership(
	sceneId: string,
	ownerId: string,
): Promise<boolean> {
	const [scene] = await db
		.select({ id: scenes.id })
		.from(scenes)
		.where(and(eq(scenes.id, sceneId), eq(scenes.ownerId, ownerId)));
	return !!scene;
}
