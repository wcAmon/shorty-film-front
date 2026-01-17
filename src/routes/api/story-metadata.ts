import { createFileRoute } from "@tanstack/react-router";
import {
	deleteStoryById,
	getImageById,
	getScenesByStoryId,
	getScenesWithMedia,
	getStoryById,
	listUserStories,
	listUserStoriesByType,
	updateStory,
	verifyStoryOwnership,
} from "@/db/queries";
import { requireAuth } from "@/lib/auth-middleware";

// Response types
interface StoryListItem {
	storyId: string;
	type: string;
	script?: string | null;
	playScript?: string | null;
	characterPrompt?: string | null;
	person1Prompt?: string | null;
	person2Prompt?: string | null;
	imageEngine?: string | null;
	imageStyle?: string | null;
	videoEngine?: string | null;
	voiceId?: string | null;
	hasExportedVideo: boolean;
	exportVideoUrl?: string | null;
	createdAt: string;
	updatedAt: string;
	// Scene statistics
	scenes: Array<{
		id: string;
		hasAudio: boolean;
		hasVideo: boolean;
	}>;
}

interface ListStoriesResponse {
	success: boolean;
	stories?: StoryListItem[];
	error?: string;
}

interface GetStoryResponse {
	success: boolean;
	story?: {
		id: string;
		type: string;
		script?: string | null;
		playScript?: string | null;
		characterPrompt?: string | null;
		person1Prompt?: string | null;
		person2Prompt?: string | null;
		imageEngine?: string | null;
		imageStyle?: string | null;
		videoEngine?: string | null;
		voiceId?: string | null;
		hasExportedVideo: boolean;
		exportVideoUrl?: string | null;
		createdAt: Date;
		updatedAt: Date;
	};
	scenes?: Array<{
		id: string;
		orderIndex: number;
		caption?: string | null;
		title?: string | null;
		prompt?: string | null;
		videoPrompt?: string | null;
		isCharacter: boolean;
		speaker?: string | null;
		imageId?: string | null;
		audioId?: string | null;
		videoId?: string | null;
		// Media URLs
		imageUrl?: string | null;
		audioUrl?: string | null;
		videoUrl?: string | null;
		// Media metadata
		audioDuration?: number | null;
		videoDuration?: number | null;
	}>;
	// Character images (for podcast42)
	characterImages?: {
		person1?: {
			imageId: string;
			imageUrl: string | null;
		};
		person2?: {
			imageId: string;
			imageUrl: string | null;
		};
		character?: {
			imageId: string;
			imageUrl: string | null;
		};
	};
	error?: string;
}

interface UpdateStoryResponse {
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
				// Require authentication
				const { user, error } = await requireAuth(request);
				if (error) return error;

				try {
					const url = new URL(request.url);
					const storyId = url.searchParams.get("storyId");
					const type = url.searchParams.get("type") as
						| "aistory"
						| "podcast42"
						| null;

					// If storyId provided, return that specific story with scenes and media
					if (storyId) {
						// Verify user owns this story
						const isOwner = await verifyStoryOwnership(storyId, user.id);
						if (!isOwner) {
							return Response.json(
								{ success: false, error: "Story not found" },
								{ status: 404 },
							);
						}

						const story = await getStoryById(storyId);
						if (!story) {
							return Response.json(
								{ success: false, error: "Story not found" },
								{ status: 404 },
							);
						}

						// Get scenes with full media details
						const scenesWithMedia = await getScenesWithMedia(storyId);

						// Build scenes response with media URLs and status
						const scenes = scenesWithMedia.map(
							({ scene, audio, image, video }) => ({
								id: scene.id,
								orderIndex: scene.orderIndex,
								caption: scene.caption,
								title: scene.title,
								prompt: scene.prompt,
								videoPrompt: scene.videoPrompt,
								isCharacter: scene.isCharacter,
								speaker: scene.speaker,
								imageId: scene.imageId,
								audioId: scene.audioId,
								videoId: scene.videoId,
								imageUrl: image?.imageUrl ?? null,
								audioUrl: audio?.audioUrl ?? null,
								videoUrl: video?.videoUrl ?? null,
								audioDuration: audio?.duration ?? null,
								videoDuration: video?.duration ?? null,
								// Include media status for resuming generation monitoring
								imageStatus: image?.status ?? null,
								audioStatus: audio?.status ?? null,
								videoStatus: video?.status ?? null,
							}),
						);

						// Fetch character images based on story's person1ImageId and person2ImageId
						const characterImages: GetStoryResponse["characterImages"] = {};

						if (story.person1ImageId) {
							const person1Image = await getImageById(story.person1ImageId);
							if (person1Image) {
								// For aistory, show as "character"; for podcast42, show as "person1"
								if (story.type === "aistory") {
									characterImages.character = {
										imageId: person1Image.id,
										imageUrl: person1Image.imageUrl,
									};
								} else {
									characterImages.person1 = {
										imageId: person1Image.id,
										imageUrl: person1Image.imageUrl,
									};
								}
							}
						}

						if (story.person2ImageId) {
							const person2Image = await getImageById(story.person2ImageId);
							if (person2Image) {
								characterImages.person2 = {
									imageId: person2Image.id,
									imageUrl: person2Image.imageUrl,
								};
							}
						}

						return Response.json({
							success: true,
							story,
							scenes,
							characterImages:
								Object.keys(characterImages).length > 0
									? characterImages
									: undefined,
						} as GetStoryResponse);
					}

					// Otherwise list user's stories with scene statistics
					const storiesDb = type
						? await listUserStoriesByType(user.id, type)
						: await listUserStories(user.id);

					// Fetch scene data for each story
					const storiesWithScenes: StoryListItem[] = await Promise.all(
						storiesDb.map(async (story) => {
							const storyScenes = await getScenesByStoryId(story.id);
							return {
								storyId: story.id,
								type: story.type,
								script: story.script,
								playScript: story.playScript,
								characterPrompt: story.characterPrompt,
								person1Prompt: story.person1Prompt,
								person2Prompt: story.person2Prompt,
								imageEngine: story.imageEngine,
								imageStyle: story.imageStyle,
								videoEngine: story.videoEngine,
								voiceId: story.voiceId,
								hasExportedVideo: story.hasExportedVideo ?? false,
								exportVideoUrl: story.exportVideoUrl,
								createdAt:
									story.createdAt?.toISOString() ?? new Date().toISOString(),
								updatedAt:
									story.updatedAt?.toISOString() ?? new Date().toISOString(),
								scenes: storyScenes.map((scene) => ({
									id: scene.id,
									hasAudio: !!scene.audioId,
									hasVideo: !!scene.videoId,
								})),
							};
						}),
					);

					return Response.json({
						success: true,
						stories: storiesWithScenes,
					} as ListStoriesResponse);
				} catch (err) {
					console.error("[story-metadata] GET error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error ? err.message : "Failed to get stories",
						},
						{ status: 500 },
					);
				}
			},

			// POST: Update story metadata
			POST: async ({ request }) => {
				// Require authentication
				const { user, error } = await requireAuth(request);
				if (error) return error;

				try {
					const body = (await request.json()) as {
						storyId: string;
						updates: {
							script?: string;
							playScript?: string;
							characterPrompt?: string;
							person1Prompt?: string;
							person2Prompt?: string;
							imageEngine?: string;
							imageStyle?: string;
							videoEngine?: string;
							voiceId?: string;
						};
					};
					const { storyId, updates } = body;

					if (!storyId) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}

					// Verify user owns this story
					const isOwner = await verifyStoryOwnership(storyId, user.id);
					if (!isOwner) {
						return Response.json(
							{ success: false, error: "Story not found" },
							{ status: 404 },
						);
					}

					// Update the story
					await updateStory(storyId, updates);

					return Response.json({ success: true } as UpdateStoryResponse);
				} catch (err) {
					console.error("[story-metadata] POST error:", err);
					return Response.json(
						{
							success: false,
							error:
								err instanceof Error ? err.message : "Failed to update story",
						},
						{ status: 500 },
					);
				}
			},

			// DELETE: Delete a story
			DELETE: async ({ request }) => {
				// Require authentication
				const { user, error } = await requireAuth(request);
				if (error) return error;

				try {
					const url = new URL(request.url);
					const storyId = url.searchParams.get("storyId");

					if (!storyId) {
						return Response.json(
							{ success: false, error: "Story ID is required" },
							{ status: 400 },
						);
					}

					// Verify user owns this story
					const isOwner = await verifyStoryOwnership(storyId, user.id);
					if (!isOwner) {
						return Response.json(
							{ success: false, error: "Story not found" },
							{ status: 404 },
						);
					}

					// Note: This deletes the story and cascades to scenes
					// Media files in Supabase Storage are NOT automatically deleted
					// They become orphaned for potential future "asset library" feature
					await deleteStoryById(storyId);

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
