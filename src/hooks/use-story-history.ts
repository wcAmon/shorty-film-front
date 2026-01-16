import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StoryMetadata } from "@/lib/cache";

// ============================================================================
// API Response Types
// ============================================================================

interface ListStoriesResponse {
	success: boolean;
	stories?: StoryMetadata[];
	error?: string;
}

interface GetStoryResponse {
	success: boolean;
	metadata?: StoryMetadata;
	files?: {
		characterImageBase64?: string | null;
		person1ImageBase64?: string | null;
		person2ImageBase64?: string | null;
		sceneImages?: Record<number, string | null>;
		sceneAudios?: Record<number, string | null>;
		sceneVideos?: Record<number, string | null>;
	};
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

// ============================================================================
// API Functions
// ============================================================================

async function listStoriesApi(
	type?: "aistory" | "podcast42",
): Promise<ListStoriesResponse> {
	const url = type
		? `/api/story-metadata?type=${type}`
		: "/api/story-metadata";
	const response = await fetch(url);
	return response.json();
}

async function getStoryApi(storyId: string): Promise<GetStoryResponse> {
	const response = await fetch(`/api/story-metadata?storyId=${storyId}`);
	return response.json();
}

async function saveStoryMetadataApi(
	metadata: StoryMetadata,
): Promise<SaveStoryResponse> {
	const response = await fetch("/api/story-metadata", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ metadata }),
	});
	return response.json();
}

async function deleteStoryApi(storyId: string): Promise<DeleteStoryResponse> {
	const response = await fetch(`/api/story-metadata?storyId=${storyId}`, {
		method: "DELETE",
	});
	return response.json();
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to list all stories or filter by type
 */
export function useListStories(type?: "aistory" | "podcast42") {
	return useQuery({
		queryKey: ["stories", type],
		queryFn: () => listStoriesApi(type),
		// Always fetch fresh data, don't use stale cache
		staleTime: 0,
		gcTime: 0,
	});
}

/**
 * Hook to get a specific story with all its data
 */
export function useGetStory(storyId: string | null) {
	return useQuery({
		queryKey: ["story", storyId],
		queryFn: () => (storyId ? getStoryApi(storyId) : Promise.resolve(null)),
		enabled: !!storyId,
	});
}

/**
 * Hook to save story metadata
 */
export function useSaveStoryMetadata() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: saveStoryMetadataApi,
		onSuccess: (_, metadata) => {
			// Invalidate both the list and the specific story
			queryClient.invalidateQueries({ queryKey: ["stories"] });
			queryClient.invalidateQueries({ queryKey: ["story", metadata.storyId] });
		},
	});
}

/**
 * Hook to delete a story
 */
export function useDeleteStory() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: deleteStoryApi,
		onSuccess: () => {
			// Invalidate the stories list
			queryClient.invalidateQueries({ queryKey: ["stories"] });
		},
	});
}

// ============================================================================
// Helper Functions for Converting Store State to Metadata
// ============================================================================

/**
 * Re-export StoryMetadata type for convenience
 */
export type { StoryMetadata, StorySceneMetadata } from "@/lib/cache";
