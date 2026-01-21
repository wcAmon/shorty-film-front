import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "./use-auth";
import type {
	ChatMessage,
	ChatResponse,
	ToolCallResult,
} from "@/routes/api/assistant-chat";
import type {
	VideoPreferences,
	UserPreferencesResponse,
} from "@/routes/api/user-preferences";

// ============================================================================
// Chat API
// ============================================================================

interface SendMessageParams {
	storyId: string | null;
	messages: ChatMessage[];
	systemPrompt: string;
}

/**
 * Send a message to the AI assistant
 */
export function useSendAssistantMessage() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (params: SendMessageParams): Promise<ChatResponse> => {
			const response = await authFetch("/api/assistant-chat", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(params),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to send message");
			}

			return response.json();
		},
		onSuccess: (data) => {
			// If tools modified data, invalidate relevant queries
			if (data.toolCalls && data.toolCalls.length > 0) {
				// Invalidate story and scenes queries to refresh the UI
				queryClient.invalidateQueries({ queryKey: ["story"] });
				queryClient.invalidateQueries({ queryKey: ["scenes"] });
				queryClient.invalidateQueries({ queryKey: ["storyMetadata"] });
			}
		},
	});
}

// ============================================================================
// User Preferences API
// ============================================================================

/**
 * Fetch user preferences
 */
export function useUserPreferences() {
	return useQuery({
		queryKey: ["userPreferences"],
		queryFn: async (): Promise<UserPreferencesResponse> => {
			const response = await authFetch("/api/user-preferences");

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to fetch preferences");
			}

			return response.json();
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

/**
 * Update user preferences
 */
export function useUpdateUserPreferences() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (params: {
			videoPreferences?: VideoPreferences;
			preferenceSummary?: string;
		}) => {
			const response = await authFetch("/api/user-preferences", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(params),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || "Failed to update preferences");
			}

			return response.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["userPreferences"] });
		},
	});
}

// Re-export types for convenience
export type { ChatMessage, ChatResponse, ToolCallResult };
export type { VideoPreferences, UserPreferencesResponse };
