import { useMutation } from "@tanstack/react-query";

// ============================================================================
// Type Definitions
// ============================================================================

export type ImageStyle = "cinematic" | "comic" | "low-poly" | "japanese-anime" | "clay";

export interface Scene {
	id: string;
	title: string;
	prompt: string;
	video_prompt: string;
	isCharacter: boolean;
	caption: string;
}

export interface WordTimestamp {
	word: string;
	startTime: number;
	endTime: number;
}

// API Response types
interface GeneratePromptsResponse {
	success: boolean;
	storyId?: string;
	characterPrompt?: string;
	scenes?: Scene[];
	error?: string;
}

interface GenerateCharacterResponse {
	success: boolean;
	imageBase64?: string;
	fileId?: string; // OpenAI file_id (for GPT Image)
	imageUrl?: string; // FAL storage URL (for Flux Pro)
	error?: string;
}

interface UploadCharacterResponse {
	success: boolean;
	fileId?: string;
	error?: string;
}

interface GenerateSceneImageResponse {
	success: boolean;
	imageBase64?: string;
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

async function generatePromptsApi(
	params: { script: string; imageStyle?: ImageStyle; testMode?: boolean },
): Promise<GeneratePromptsResponse> {
	const { script, imageStyle, testMode } = params;
	const response = await fetch("/api/generate-prompts", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ script, imageStyle, testMode }),
	});
	return response.json();
}

async function generateCharacterApi(params: {
	prompt: string;
	storyId: string;
	imageEngine?: "gpt-image" | "flux-pro";
	imageStyle?: ImageStyle;
}): Promise<GenerateCharacterResponse> {
	const response = await fetch("/api/generate-character", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

async function uploadCharacterApi(
	imageBase64: string,
): Promise<UploadCharacterResponse> {
	const response = await fetch("/api/upload-character", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ imageBase64 }),
	});
	return response.json();
}

async function generateSceneImageApi(params: {
	prompt: string;
	storyId: string;
	sceneIndex: number;
	isCharacter: boolean;
	characterFileId?: string; // OpenAI file_id (for GPT Image)
	characterImageUrl?: string; // FAL storage URL (for Flux Pro)
	imageEngine?: "gpt-image" | "flux-pro";
}): Promise<GenerateSceneImageResponse> {
	const response = await fetch("/api/generate-scene-image", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

async function generateSceneAudioApi(params: {
	caption: string;
	storyId: string;
	sceneIndex: number;
	voiceId?: string;
}): Promise<GenerateSceneAudioResponse> {
	const response = await fetch("/api/generate-scene-audio", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

// Submit a video generation job (non-blocking)
async function submitVideoJobApi(params: {
	storyId: string;
	sceneIndex: number;
	videoPrompt: string;
	imageBase64: string;
	audioDuration: number;
	videoEngine?: string;
}): Promise<SubmitVideoJobResponse> {
	const response = await fetch("/api/generate-scene-video", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

// Check video generation status
async function checkVideoStatusApi(params: {
	storyId: string;
	sceneIndex: number;
}): Promise<CheckVideoStatusResponse> {
	const response = await fetch("/api/generate-scene-video", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

// Poll for video completion with configurable interval
async function generateSceneVideoWithPolling(params: {
	storyId: string;
	sceneIndex: number;
	videoPrompt: string;
	imageBase64: string;
	audioDuration: number;
	videoEngine?: string;
	onStatusUpdate?: (
		status: "pending" | "processing" | "completed" | "failed",
	) => void;
	pollInterval?: number;
	maxAttempts?: number;
}): Promise<CheckVideoStatusResponse> {
	const {
		storyId,
		sceneIndex,
		videoPrompt,
		imageBase64,
		audioDuration,
		videoEngine,
		onStatusUpdate,
		pollInterval = 5000, // 5 seconds
		maxAttempts = 120, // 10 minutes max (120 * 5s)
	} = params;

	// Submit the job
	const submitResult = await submitVideoJobApi({
		storyId,
		sceneIndex,
		videoPrompt,
		imageBase64,
		audioDuration,
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

		const statusResult = await checkVideoStatusApi({ storyId, sceneIndex });

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

// ============================================================================
// React Query Hooks
// ============================================================================

/**
 * Hook to generate prompts from a script
 */
export function useGeneratePrompts() {
	return useMutation({
		mutationFn: generatePromptsApi,
	});
}

/**
 * Hook to generate a character image from a prompt
 * Supports both GPT Image and Flux Pro engines
 */
export function useGenerateCharacter() {
	return useMutation({
		mutationFn: (params: {
			prompt: string;
			storyId: string;
			imageEngine?: "gpt-image" | "flux-pro";
			imageStyle?: ImageStyle;
		}) => generateCharacterApi(params),
	});
}

/**
 * Hook to upload a character image to OpenAI
 */
export function useUploadCharacter() {
	return useMutation({
		mutationFn: uploadCharacterApi,
	});
}

/**
 * Hook to generate a scene image
 * Supports both GPT Image and Flux Pro engines
 */
export function useGenerateSceneImage() {
	return useMutation({
		mutationFn: (params: {
			prompt: string;
			storyId: string;
			sceneIndex: number;
			isCharacter: boolean;
			characterFileId?: string; // OpenAI file_id (for GPT Image)
			characterImageUrl?: string; // FAL storage URL (for Flux Pro)
			imageEngine?: "gpt-image" | "flux-pro";
		}) => generateSceneImageApi(params),
	});
}

/**
 * Hook to generate scene audio with ElevenLabs
 * Supports voice selection via voiceId parameter
 */
export function useGenerateSceneAudio() {
	return useMutation({
		mutationFn: (params: {
			caption: string;
			storyId: string;
			sceneIndex: number;
			voiceId?: string;
		}) => generateSceneAudioApi(params),
	});
}

/**
 * Hook to generate scene video from image + prompt (with polling)
 * Uses queue-based API: submits job, then polls for completion
 */
export function useGenerateSceneVideo() {
	return useMutation({
		mutationFn: (params: {
			storyId: string;
			sceneIndex: number;
			videoPrompt: string;
			imageBase64: string;
			audioDuration: number;
			videoEngine?: string;
			onStatusUpdate?: (
				status: "pending" | "processing" | "completed" | "failed",
			) => void;
		}) => generateSceneVideoWithPolling(params),
	});
}

// Export video API function
async function exportVideoApi(params: {
	storyId: string;
	sceneCount: number;
}): Promise<ExportVideoResponse> {
	const response = await fetch("/api/export-video", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

/**
 * Hook to export final video with all scenes combined
 * Now uses server-side cache, only needs storyId and sceneCount
 */
export function useExportVideo() {
	return useMutation({
		mutationFn: (params: { storyId: string; sceneCount: number }) =>
			exportVideoApi(params),
	});
}
