import { createFileRoute } from "@tanstack/react-router";
import {
	type StoryMetadata,
	type StorySceneMetadata,
	listAllStories,
	listStoriesByType,
	loadStoryMetadata,
	saveStoryMetadata,
	deleteStory,
	// File existence checks
	characterImageExists,
	person1ImageExists,
	person2ImageExists,
	sceneImageExists,
	sceneAudioExists,
	sceneVideoExists,
	exportedVideoExists,
	// Base64 readers for loading state
	readCharacterImageBase64,
	readPerson1ImageBase64,
	readPerson2ImageBase64,
	readSceneImageBase64,
	readSceneAudioBase64,
	readSceneVideoBase64,
	// URL getters
	getCharacterImageUrl,
	getPerson1ImageUrl,
	getPerson2ImageUrl,
	getSceneImageUrl,
	getSceneAudioUrl,
	getSceneVideoUrl,
	getExportedVideoUrl,
} from "@/lib/cache";

// Response types
interface ListStoriesResponse {
	success: boolean;
	stories?: StoryMetadata[];
	error?: string;
}

interface GetStoryResponse {
	success: boolean;
	metadata?: StoryMetadata;
	// Include actual file data for restoring state
	files?: {
		characterImageBase64?: string | null;
		person1ImageBase64?: string | null;
		person2ImageBase64?: string | null;
		sceneImages?: Record<number, string | null>;
		sceneAudios?: Record<number, string | null>;
		sceneVideos?: Record<number, string | null>;
	};
	// Include URLs for display
	urls?: {
		characterImageUrl?: string;
		person1ImageUrl?: string;
		person2ImageUrl?: string;
		sceneImageUrls?: Record<number, string>;
		sceneAudioUrls?: Record<number, string>;
		sceneVideoUrls?: Record<number, string>;
		exportedVideoUrl?: string;
	};
	error?: string;
}

interface SaveStoryResponse {
	success: boolean;
	error?: string;
}

interface DeleteStoryResponse {
	success: boolean;
	error?: string;
}

export const Route = createFileRoute("/api/story-metadata")({
	server: {
		handlers: {
			// GET: List stories or get a specific story
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url);
					const storyId = url.searchParams.get("storyId");
					const type = url.searchParams.get("type") as
						| "aistory"
						| "podcast42"
						| null;

					// If storyId provided, return that specific story with file data
					if (storyId) {
						const metadata = loadStoryMetadata(storyId);
						if (!metadata) {
							return Response.json(
								{ success: false, error: "Story not found" },
								{ status: 404 },
							);
						}

						// Build file data for restoring state
						const files: GetStoryResponse["files"] = {};
						const urls: GetStoryResponse["urls"] = {};

						// Character image (aistory)
						if (characterImageExists(storyId)) {
							files.characterImageBase64 = readCharacterImageBase64(storyId);
							urls.characterImageUrl = getCharacterImageUrl(storyId);
						}

						// Person images (podcast42)
						if (person1ImageExists(storyId)) {
							files.person1ImageBase64 = readPerson1ImageBase64(storyId);
							urls.person1ImageUrl = getPerson1ImageUrl(storyId);
						}
						if (person2ImageExists(storyId)) {
							files.person2ImageBase64 = readPerson2ImageBase64(storyId);
							urls.person2ImageUrl = getPerson2ImageUrl(storyId);
						}

						// Scene files
						const sceneImages: Record<number, string | null> = {};
						const sceneAudios: Record<number, string | null> = {};
						const sceneVideos: Record<number, string | null> = {};
						const sceneImageUrls: Record<number, string> = {};
						const sceneAudioUrls: Record<number, string> = {};
						const sceneVideoUrls: Record<number, string> = {};

						for (let i = 0; i < metadata.scenes.length; i++) {
							if (sceneImageExists(storyId, i)) {
								sceneImages[i] = readSceneImageBase64(storyId, i);
								sceneImageUrls[i] = getSceneImageUrl(storyId, i);
							}
							if (sceneAudioExists(storyId, i)) {
								sceneAudios[i] = readSceneAudioBase64(storyId, i);
								sceneAudioUrls[i] = getSceneAudioUrl(storyId, i);
							}
							if (sceneVideoExists(storyId, i)) {
								sceneVideos[i] = readSceneVideoBase64(storyId, i);
								sceneVideoUrls[i] = getSceneVideoUrl(storyId, i);
							}
						}

						if (Object.keys(sceneImages).length > 0) {
							files.sceneImages = sceneImages;
							urls.sceneImageUrls = sceneImageUrls;
						}
						if (Object.keys(sceneAudios).length > 0) {
							files.sceneAudios = sceneAudios;
							urls.sceneAudioUrls = sceneAudioUrls;
						}
						if (Object.keys(sceneVideos).length > 0) {
							files.sceneVideos = sceneVideos;
							urls.sceneVideoUrls = sceneVideoUrls;
						}

						// Exported video
						if (exportedVideoExists(storyId)) {
							urls.exportedVideoUrl = getExportedVideoUrl(storyId);
						}

						return Response.json({
							success: true,
							metadata,
							files,
							urls,
						} as GetStoryResponse);
					}

					// Otherwise list stories
					const stories = type ? listStoriesByType(type) : listAllStories();

					return Response.json({
						success: true,
						stories,
					} as ListStoriesResponse);
				} catch (err) {
					console.error("[story-metadata] GET error:", err);
					return Response.json(
						{
							success: false,
							error: err instanceof Error ? err.message : "Failed to get stories",
						},
						{ status: 500 },
					);
				}
			},

			// POST: Save/update story metadata
			POST: async ({ request }) => {
				try {
					const body = (await request.json()) as { metadata: StoryMetadata };
					const { metadata } = body;

					if (!metadata?.storyId) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}

					// Update scene flags based on actual files
					const updatedScenes: StorySceneMetadata[] = metadata.scenes.map(
						(scene, index) => ({
							...scene,
							hasImage: sceneImageExists(metadata.storyId, index),
							hasAudio: sceneAudioExists(metadata.storyId, index),
							hasVideo: sceneVideoExists(metadata.storyId, index),
						}),
					);

					// Update character/person flags
					const updatedMetadata: StoryMetadata = {
						...metadata,
						scenes: updatedScenes,
						hasCharacterImage: characterImageExists(metadata.storyId),
						hasPerson1Image: person1ImageExists(metadata.storyId),
						hasPerson2Image: person2ImageExists(metadata.storyId),
						hasExportedVideo: exportedVideoExists(metadata.storyId),
					};

					saveStoryMetadata(updatedMetadata);

					return Response.json({ success: true } as SaveStoryResponse);
				} catch (err) {
					console.error("[story-metadata] POST error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error ? err.message : "Failed to save metadata",
						},
						{ status: 500 },
					);
				}
			},

			// DELETE: Delete a story
			DELETE: async ({ request }) => {
				try {
					const url = new URL(request.url);
					const storyId = url.searchParams.get("storyId");

					if (!storyId) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}

					deleteStory(storyId);

					return Response.json({ success: true } as DeleteStoryResponse);
				} catch (err) {
					console.error("[story-metadata] DELETE error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error ? err.message : "Failed to delete story",
						},
						{ status: 500 },
					);
				}
			},
		},
	},
});
