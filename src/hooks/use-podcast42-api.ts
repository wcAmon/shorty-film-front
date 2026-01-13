import { useMutation } from "@tanstack/react-query";
import type { ImageEngine, ImageStyle, VoiceId, WordTimestamp } from "./use-aistory-api";

// Video engine type for podcast42
export type Podcast42VideoEngine = "omnihuman" | "aurora";

// ============================================================================
// Type Definitions
// ============================================================================

export interface Podcast42Scene {
	speaker: "person1" | "person2";
	caption: string;
}

// API Response types
interface GeneratePodcast42PromptsResponse {
	success: boolean;
	storyId?: string;
	person1Prompt?: string;
	person2Prompt?: string;
	scenes?: Podcast42Scene[];
	error?: string;
}

interface GeneratePodcast42CharacterResponse {
	success: boolean;
	imageBase64?: string;
	imageUrl?: string; // FAL storage URL
	error?: string;
}

interface UploadPodcast42CharacterResponse {
	success: boolean;
	imageUrl?: string; // FAL storage URL
	error?: string;
}

interface GenerateSceneAudioResponse {
	success: boolean;
	audioBase64?: string;
	wordTimestamps?: WordTimestamp[];
	audioDuration?: number;
	error?: string;
}

// Video generation API types (queue-based)
interface SubmitVideoJobResponse {
	success: boolean;
	requestId?: string;
	error?: string;
}

interface CheckVideoStatusResponse {
	success: boolean;
	status: "pending" | "processing" | "completed" | "failed";
	videoBase64?: string;
	videoDuration?: number;
	error?: string;
}

// Export video API types
interface ExportVideoResponse {
	success: boolean;
	videoUrl?: string;
	error?: string;
}

// ============================================================================
// API Functions
// ============================================================================

async function generatePodcast42PromptsApi(params: {
	playScript: string;
	imageStyle?: ImageStyle;
	testMode?: boolean;
}): Promise<GeneratePodcast42PromptsResponse> {
	const response = await fetch("/api/podcast42-generate-prompts", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

async function generatePodcast42CharacterApi(params: {
	prompt: string;
	storyId: string;
	imageEngine?: "gpt-image" | "flux-pro";
	imageStyle?: ImageStyle;
	person: "person1" | "person2";
}): Promise<GeneratePodcast42CharacterResponse> {
	// Use existing generate-character API with 16:9 aspect ratio for podcast
	const response = await fetch("/api/generate-character", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			prompt: params.prompt,
			storyId: params.storyId,
			imageEngine: params.imageEngine,
			imageStyle: params.imageStyle,
			aspectRatio: "16:9", // Podcast uses landscape format
			person: params.person, // For metadata update
		}),
	});
	return response.json();
}

async function uploadPodcast42CharacterApi(params: {
	imageBase64: string;
	person: "person1" | "person2";
	storyId: string;
}): Promise<UploadPodcast42CharacterResponse> {
	// Upload to FAL storage for OmniHuman and save to cache
	const response = await fetch("/api/upload-podcast42-character", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

async function generatePodcast42SceneAudioApi(params: {
	caption: string;
	storyId: string;
	sceneIndex: number;
	voiceId?: string;
}): Promise<GenerateSceneAudioResponse> {
	// Use existing generate-scene-audio API
	const response = await fetch("/api/generate-scene-audio", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

// Submit a video generation job (non-blocking)
async function submitPodcast42VideoJobApi(params: {
	storyId: string;
	sceneIndex: number;
	imageUrl: string;
	audioBase64: string;
	videoEngine?: Podcast42VideoEngine;
}): Promise<SubmitVideoJobResponse> {
	const response = await fetch("/api/podcast42-generate-video", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

// Check video generation status
async function checkPodcast42VideoStatusApi(params: {
	storyId: string;
	sceneIndex: number;
}): Promise<CheckVideoStatusResponse> {
	const response = await fetch("/api/podcast42-generate-video", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

// Poll for video completion with configurable interval
async function generatePodcast42SceneVideoWithPolling(params: {
	storyId: string;
	sceneIndex: number;
	imageUrl: string;
	audioBase64: string;
	videoEngine?: Podcast42VideoEngine;
	onStatusUpdate?: (
		status: "pending" | "processing" | "completed" | "failed",
	) => void;
	pollInterval?: number;
	maxAttempts?: number;
}): Promise<CheckVideoStatusResponse> {
	const {
		storyId,
		sceneIndex,
		imageUrl,
		audioBase64,
		videoEngine = "omnihuman",
		onStatusUpdate,
		pollInterval = 5000, // 5 seconds
		maxAttempts = 120, // 10 minutes max (120 * 5s)
	} = params;

	// Submit the job
	const submitResult = await submitPodcast42VideoJobApi({
		storyId,
		sceneIndex,
		imageUrl,
		audioBase64,
		videoEngine,
	});

	if (!submitResult.success) {
		return {
			success: false,
			status: "failed",
			error: submitResult.error || "Failed to submit video job",
		};
	}

	// Poll for completion
	let attempts = 0;
	while (attempts < maxAttempts) {
		await new Promise((resolve) => setTimeout(resolve, pollInterval));
		attempts++;

		const statusResult = await checkPodcast42VideoStatusApi({
			storyId,
			sceneIndex,
		});

		if (onStatusUpdate) {
			onStatusUpdate(statusResult.status);
		}

		if (statusResult.status === "completed") {
			return statusResult;
		}

		if (statusResult.status === "failed") {
			return {
				success: false,
				status: "failed",
				error: statusResult.error || "Video generation failed",
			};
		}

		// Continue polling if still processing
	}

	// Timeout
	return {
		success: false,
		status: "failed",
		error: "Video generation timed out",
	};
}

// Export video API function
async function exportPodcast42VideoApi(params: {
	storyId: string;
	sceneCount: number;
}): Promise<ExportVideoResponse> {
	// Use existing export-video API
	const response = await fetch("/api/export-video", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to generate prompts from a play script
 */
export function useGeneratePodcast42Prompts() {
	return useMutation({
		mutationFn: generatePodcast42PromptsApi,
	});
}

/**
 * Hook to generate a character image from a prompt
 * Supports both GPT Image and Flux Pro engines
 */
export function useGeneratePodcast42Character() {
	return useMutation({
		mutationFn: (params: {
			prompt: string;
			storyId: string;
			imageEngine?: "gpt-image" | "flux-pro";
			imageStyle?: ImageStyle;
			person: "person1" | "person2";
		}) => generatePodcast42CharacterApi(params),
	});
}

/**
 * Hook to upload a character image for OmniHuman
 */
export function useUploadPodcast42Character() {
	return useMutation({
		mutationFn: uploadPodcast42CharacterApi,
	});
}

/**
 * Hook to generate scene audio with ElevenLabs
 * Uses appropriate voice based on speaker
 */
export function useGeneratePodcast42SceneAudio() {
	return useMutation({
		mutationFn: (params: {
			caption: string;
			storyId: string;
			sceneIndex: number;
			voiceId?: string;
		}) => generatePodcast42SceneAudioApi(params),
	});
}

/**
 * Hook to generate scene video using OmniHuman or Aurora (with polling)
 * Uses queue-based API: submits job, then polls for completion
 */
export function useGeneratePodcast42SceneVideo() {
	return useMutation({
		mutationFn: (params: {
			storyId: string;
			sceneIndex: number;
			imageUrl: string;
			audioBase64: string;
			videoEngine?: Podcast42VideoEngine;
			onStatusUpdate?: (
				status: "pending" | "processing" | "completed" | "failed",
			) => void;
		}) => generatePodcast42SceneVideoWithPolling(params),
	});
}

/**
 * Hook to export final video with all scenes combined
 */
export function useExportPodcast42Video() {
	return useMutation({
		mutationFn: (params: { storyId: string; sceneCount: number }) =>
			exportPodcast42VideoApi(params),
	});
}

// ============================================================================
// Settings Sync API
// ============================================================================

interface UpdateSettingsResponse {
	success: boolean;
	error?: string;
}

/**
 * Update podcast42 settings in metadata JSON
 */
async function updatePodcast42SettingsApi(params: {
	storyId: string;
	imageEngine?: ImageEngine;
	imageStyle?: ImageStyle;
	person1VoiceId?: VoiceId;
	person2VoiceId?: VoiceId;
	videoEngine?: Podcast42VideoEngine;
}): Promise<UpdateSettingsResponse> {
	const { storyId, ...settings } = params;

	// First get current metadata
	const getResponse = await fetch(`/api/story-metadata?storyId=${storyId}`);
	const getData = await getResponse.json();

	if (!getData.success || !getData.metadata) {
		return { success: false, error: "Failed to get current metadata" };
	}

	// Update metadata with new settings
	const updatedMetadata = {
		...getData.metadata,
		...(settings.imageEngine && { imageEngine: settings.imageEngine }),
		...(settings.imageStyle && { imageStyle: settings.imageStyle }),
		...(settings.person1VoiceId && { person1VoiceId: settings.person1VoiceId }),
		...(settings.person2VoiceId && { person2VoiceId: settings.person2VoiceId }),
		...(settings.videoEngine && { podcast42VideoEngine: settings.videoEngine }),
	};

	// Save updated metadata
	const saveResponse = await fetch("/api/story-metadata", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ metadata: updatedMetadata }),
	});
	return saveResponse.json();
}

/**
 * Hook to update podcast42 settings in metadata
 */
export function useUpdatePodcast42Settings() {
	return useMutation({
		mutationFn: updatePodcast42SettingsApi,
	});
}
