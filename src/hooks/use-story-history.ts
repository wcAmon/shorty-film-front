import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { StoryMetadata } from "@/lib/cache";
import { authFetch } from "./use-auth";

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
	const url = type ? `/api/story-metadata?type=${type}` : "/api/story-metadata";
	const response = await authFetch(url);
	return response.json();
}

async function getStoryApi(storyId: string): Promise<GetStoryResponse> {
	const response = await authFetch(`/api/story-metadata?storyId=${storyId}`);
	return response.json();
}

async function saveStoryMetadataApi(
	metadata: StoryMetadata,
): Promise<SaveStoryResponse> {
	const response = await authFetch("/api/story-metadata", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ metadata }),
	});
	return response.json();
}

async function deleteStoryApi(storyId: string): Promise<DeleteStoryResponse> {
	const response = await authFetch(`/api/story-metadata?storyId=${storyId}`, {
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
 * Hook to delete a story with optimistic update
 * Immediately removes the story from UI, rolls back on error
 */
export function useDeleteStory() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: deleteStoryApi,
		onMutate: async (storyId: string) => {
			// Cancel any outgoing refetches to avoid overwriting optimistic update
			await queryClient.cancelQueries({ queryKey: ["stories"] });

			// Snapshot the previous value
			const previousStories = queryClient.getQueryData<ListStoriesResponse>([
				"stories",
			]);

			// Optimistically remove the story from cache
			queryClient.setQueryData<ListStoriesResponse>(["stories"], (old) => {
				if (!old?.stories) return old;
				return {
					...old,
					stories: old.stories.filter((story) => story.storyId !== storyId),
				};
			});

			// Also update any type-filtered queries
			for (const type of ["aistory", "podcast42"] as const) {
				queryClient.setQueryData<ListStoriesResponse>(
					["stories", type],
					(old) => {
						if (!old?.stories) return old;
						return {
							...old,
							stories: old.stories.filter((story) => story.storyId !== storyId),
						};
					},
				);
			}

			// Return context with the previous value for rollback
			return { previousStories };
		},
		onError: (_err, _storyId, context) => {
			// Rollback to previous state on error
			if (context?.previousStories) {
				queryClient.setQueryData(["stories"], context.previousStories);
			}
		},
		onSettled: () => {
			// Always refetch after mutation settles (success or error)
			// This ensures we're in sync with the server
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
