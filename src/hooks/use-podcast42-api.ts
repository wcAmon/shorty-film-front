import { useMutation } from "@tanstack/react-query";
import type {
	ImageEngine,
	ImageStyle,
	LLMEngine,
	VoiceId,
	WordTimestamp,
} from "./use-aistory-api";
import { authFetch } from "./use-auth";
import { supabaseClient } from "@/lib/supabase-client";

// Avatar engine type for podcast42 (renamed from videoEngine)
export type Podcast42AvatarEngine = "omnihuman" | "aurora";

// Job status type
type JobStatus = "pending" | "processing" | "completed" | "failed";

// ============================================================================
// Job Polling Utilities
// ============================================================================

interface JobRowFromRealtime {
	id: string;
	status: JobStatus;
	media_type: string;
	media_id: string;
	story_id: string;
	scene_id: string;
	error_message: string | null;
}

interface JobRecord {
	id: string;
	status: JobStatus;
	mediaId: string;
	storyId?: string;
	sceneId?: string;
	errorMessage: string | null;
	mediaUrl?: string | null;
	// Podcast42-specific fields from job metadata
	person1Prompt?: string;
	person2Prompt?: string;
	scenes?: Podcast42Scene[];
}

function normalizeJobRow(row: JobRowFromRealtime): JobRecord {
	return {
		id: row.id,
		status: row.status,
		mediaId: row.media_id,
		storyId: row.story_id,
		sceneId: row.scene_id,
		errorMessage: row.error_message,
	};
}

async function fetchJobStatus(
	jobId: string,
): Promise<{ success: boolean; job?: JobRecord; error?: string }> {
	try {
		const response = await authFetch(`/api/get-job-status?jobId=${jobId}`);
		const result = await response.json();

		if (!result.success) {
			return { success: false, error: result.error };
		}

		return {
			success: true,
			job: {
				id: result.job.id,
				status: result.job.status,
				mediaId: result.job.mediaId,
				storyId: result.job.storyId,
				errorMessage: result.job.errorMessage,
				mediaUrl: result.job.mediaUrl,
				// Podcast42-specific: extract from job metadata
				person1Prompt: result.job.person1Prompt,
				person2Prompt: result.job.person2Prompt,
				scenes: result.job.scenes,
			},
		};
	} catch (err) {
		console.error("[podcast42:fetchJobStatus] Error:", err);
		return {
			success: false,
			error: err instanceof Error ? err.message : "Failed to fetch job status",
		};
	}
}

async function waitForJobCompletion(
	jobId: string,
	options: {
		timeoutMs?: number;
		onStatusUpdate?: (status: JobStatus) => void;
	} = {},
): Promise<{ success: boolean; job?: JobRecord; error?: string }> {
	const { timeoutMs = 300000, onStatusUpdate } = options;

	return new Promise((resolve) => {
		let resolved = false;
		let pollingInterval: ReturnType<typeof setInterval> | null = null;

		console.log(`[podcast42:waitForJobCompletion:${jobId}] Creating channel`);

		const channel = supabaseClient.channel(`job-${jobId}`);

		const cleanup = () => {
			if (pollingInterval) {
				clearInterval(pollingInterval);
				pollingInterval = null;
			}
			channel.unsubscribe();
		};

		const handleJobStatus = (job: JobRecord) => {
			console.log(
				`[podcast42:waitForJobCompletion:${jobId}] handleJobStatus:`,
				job.status,
			);
			onStatusUpdate?.(job.status);

			if (job.status === "completed") {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeoutId);
					cleanup();
					resolve({ success: true, job });
				}
			} else if (job.status === "failed") {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeoutId);
					cleanup();
					resolve({
						success: false,
						error: job.errorMessage || "Job failed",
						job,
					});
				}
			}
		};

		const pollJobStatus = async () => {
			if (resolved) return;

			const result = await fetchJobStatus(jobId);
			if (result.success && result.job) {
				handleJobStatus(result.job);
			}
		};

		const timeoutId = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				cleanup();
				resolve({ success: false, error: "Job completion timed out" });
			}
		}, timeoutMs);

		let realtimeActive = false;

		channel.on(
			"postgres_changes",
			{
				event: "*",
				schema: "shorty",
				table: "jobs",
				filter: `id=eq.${jobId}`,
			},
			async (payload) => {
				realtimeActive = true;
				const row = payload.new as JobRowFromRealtime;
				if (row) {
					if (row.status === "completed" || row.status === "failed") {
						const fullStatus = await fetchJobStatus(jobId);
						if (fullStatus.success && fullStatus.job) {
							handleJobStatus(fullStatus.job);
						} else {
							handleJobStatus(normalizeJobRow(row));
						}
					} else {
						handleJobStatus(normalizeJobRow(row));
					}
				}
			},
		);

		channel.subscribe(async (status) => {
			if (status === "SUBSCRIBED") {
				const initialStatus = await fetchJobStatus(jobId);
				if (initialStatus.success && initialStatus.job) {
					handleJobStatus(initialStatus.job);
				}

				if (!resolved) {
					setTimeout(() => {
						if (!resolved && !realtimeActive && !pollingInterval) {
							pollingInterval = setInterval(pollJobStatus, 5000);
						}
					}, 15000);
				}
			} else if (status === "CHANNEL_ERROR") {
				if (!pollingInterval && !resolved) {
					pollingInterval = setInterval(pollJobStatus, 5000);
				}
			}
		});
	});
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface Podcast42Scene {
	id?: string;
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
	imageId?: string; // Database image ID
	imageUrl?: string; // Supabase Storage URL
	falImageUrl?: string; // FAL storage URL (for video generation)
	error?: string;
}

interface UploadPodcast42CharacterResponse {
	success: boolean;
	imageId?: string; // Database image ID
	imageUrl?: string; // Supabase Storage URL
	falImageUrl?: string; // FAL storage URL (for video generation)
	error?: string;
}

interface GenerateSceneAudioResponse {
	success: boolean;
	audioId?: string; // Database audio ID
	audioUrl?: string; // Supabase Storage URL
	wordTimestamps?: WordTimestamp[];
	audioDuration?: number;
	error?: string;
}

// Video generation API types (queue-based)
interface SubmitVideoJobResponse {
	success: boolean;
	requestId?: string;
	videoId?: string; // Database video ID
	error?: string;
}

interface CheckVideoStatusResponse {
	success: boolean;
	status: "pending" | "processing" | "completed" | "failed";
	videoId?: string; // Database video ID
	videoUrl?: string; // Supabase Storage URL
	videoDuration?: number;
	error?: string;
}

// Export video API types
interface ExportVideoResponse {
	success: boolean;
	videoUrl?: string;
	error?: string;
}

// Backend job submission response
interface SubmitJobResponse {
	success: boolean;
	jobId?: string;
	mediaId?: string;
	status?: string;
	error?: string;
}

// ============================================================================
// API Functions
// ============================================================================

async function generatePodcast42PromptsApi(params: {
	playScript: string;
	imageStyle?: ImageStyle;
	imageEngine?: ImageEngine;
	llmEngine?: LLMEngine;
	person1VoiceId?: VoiceId;
	person2VoiceId?: VoiceId;
	avatarEngine?: Podcast42AvatarEngine;
	onStatusUpdate?: (status: JobStatus) => void;
}): Promise<GeneratePodcast42PromptsResponse> {
	const { onStatusUpdate, ...submitParams } = params;

	// Step 1: Submit job to backend
	const response = await authFetch("/api/podcast42-generate-prompts", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(submitParams),
	});

	const submitResult: SubmitJobResponse = await response.json();

	if (!submitResult.success || !submitResult.jobId) {
		return {
			success: false,
			error: submitResult.error || "Failed to submit podcast42 story job",
		};
	}

	console.log(
		`[generatePodcast42PromptsApi] Job submitted: ${submitResult.jobId}, storyId: ${submitResult.mediaId}`,
	);

	// Step 2: Wait for job completion via Supabase Realtime
	const jobResult = await waitForJobCompletion(submitResult.jobId, {
		timeoutMs: 120000, // 2 minutes max for prompt generation
		onStatusUpdate,
	});

	if (!jobResult.success) {
		return {
			success: false,
			error: jobResult.error || "Podcast42 story generation failed",
		};
	}

	// Step 3: Fetch full job status to get story data
	const fullStatus = await fetchJobStatus(submitResult.jobId);
	if (!fullStatus.success || !fullStatus.job) {
		return {
			success: false,
			error: fullStatus.error || "Failed to get story data",
		};
	}

	return {
		success: true,
		storyId: fullStatus.job.storyId || submitResult.mediaId,
		person1Prompt: fullStatus.job.person1Prompt,
		person2Prompt: fullStatus.job.person2Prompt,
		scenes: fullStatus.job.scenes,
	};
}

async function generatePodcast42CharacterApi(params: {
	prompt: string;
	storyId: string;
	imageEngine?: "flux-pro" | "gpt-image-1.5";
	imageStyle?: ImageStyle;
	person: "person1" | "person2";
}): Promise<GeneratePodcast42CharacterResponse> {
	// Use existing generate-character API with 16:9 aspect ratio for podcast
	const response = await authFetch("/api/generate-character", {
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
	const response = await authFetch("/api/upload-podcast42-character", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

async function generatePodcast42SceneAudioApi(params: {
	caption: string;
	storyId: string;
	sceneId: string;
	voiceId?: string;
}): Promise<GenerateSceneAudioResponse> {
	// Use existing generate-scene-audio API
	const response = await authFetch("/api/generate-scene-audio", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

// Submit a video generation job (non-blocking)
async function submitPodcast42VideoJobApi(params: {
	storyId: string;
	sceneId: string;
	imageUrl: string; // FAL storage URL for character image
	avatarEngine?: Podcast42AvatarEngine;
}): Promise<SubmitVideoJobResponse> {
	const response = await authFetch("/api/podcast42-generate-video", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

// Check video generation status
async function checkPodcast42VideoStatusApi(params: {
	storyId: string;
	sceneId: string;
}): Promise<CheckVideoStatusResponse> {
	const response = await authFetch("/api/podcast42-generate-video", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

// Poll for video completion with configurable interval
async function generatePodcast42SceneVideoWithPolling(params: {
	storyId: string;
	sceneId: string;
	imageUrl: string; // FAL storage URL for character image
	avatarEngine?: Podcast42AvatarEngine;
	onStatusUpdate?: (
		status: "pending" | "processing" | "completed" | "failed",
	) => void;
	pollInterval?: number;
	maxAttempts?: number;
}): Promise<CheckVideoStatusResponse> {
	const {
		storyId,
		sceneId,
		imageUrl,
		avatarEngine = "omnihuman",
		onStatusUpdate,
		pollInterval = 5000, // 5 seconds
		maxAttempts = 120, // 10 minutes max (120 * 5s)
	} = params;

	// Submit the job
	const submitResult = await submitPodcast42VideoJobApi({
		storyId,
		sceneId,
		imageUrl,
		avatarEngine,
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
			sceneId,
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
	// Scene IDs in the order they should be exported (supports reordering)
	sceneIds?: string[];
}): Promise<ExportVideoResponse> {
	// Use podcast42-specific export API
	const response = await authFetch("/api/podcast42-export-video", {
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
			imageEngine?: "flux-pro" | "gpt-image-1.5";
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
 * Returns audioId and audioUrl (Supabase Storage)
 */
export function useGeneratePodcast42SceneAudio() {
	return useMutation({
		mutationFn: (params: {
			caption: string;
			storyId: string;
			sceneId: string;
			voiceId?: string;
		}) => generatePodcast42SceneAudioApi(params),
	});
}

/**
 * Hook to generate scene video using OmniHuman or Aurora (with polling)
 * Uses queue-based API: submits job, then polls for completion
 * Returns videoId and videoUrl (Supabase Storage)
 */
export function useGeneratePodcast42SceneVideo() {
	return useMutation({
		mutationFn: (params: {
			storyId: string;
			sceneId: string;
			imageUrl: string; // FAL storage URL for character image
			avatarEngine?: Podcast42AvatarEngine;
			onStatusUpdate?: (
				status: "pending" | "processing" | "completed" | "failed",
			) => void;
		}) => generatePodcast42SceneVideoWithPolling(params),
	});
}

/**
 * Hook to export final video with all scenes combined
 * Returns videoUrl (Supabase Storage)
 */
export function useExportPodcast42Video() {
	return useMutation({
		mutationFn: (params: { storyId: string; sceneIds?: string[] }) =>
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
	avatarEngine?: Podcast42AvatarEngine;
}): Promise<UpdateSettingsResponse> {
	const { storyId, ...settings } = params;

	// First get current metadata
	const getResponse = await authFetch(`/api/story-metadata?storyId=${storyId}`);
	const getData = await getResponse.json();

	if (!getData.success || !getData.metadata) {
		return { success: false, error: "Failed to get current metadata" };
	}

	// Update metadata with new settings
	// Note: avatarEngine is stored as podcast42VideoEngine in DB for backward compatibility
	const updatedMetadata = {
		...getData.metadata,
		...(settings.imageEngine && { imageEngine: settings.imageEngine }),
		...(settings.imageStyle && { imageStyle: settings.imageStyle }),
		...(settings.person1VoiceId && { person1VoiceId: settings.person1VoiceId }),
		...(settings.person2VoiceId && { person2VoiceId: settings.person2VoiceId }),
		...(settings.avatarEngine && { podcast42VideoEngine: settings.avatarEngine }),
	};

	// Save updated metadata
	const saveResponse = await authFetch("/api/story-metadata", {
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

// ============================================================================
// Scene Management API
// ============================================================================

interface DeleteSceneResponse {
	success: boolean;
	error?: string;
}

/**
 * Delete scene files from storage
 */
async function deletePodcast42SceneFilesApi(params: {
	storyId: string;
	sceneId: string;
}): Promise<DeleteSceneResponse> {
	const response = await authFetch("/api/podcast42-delete-scene-files", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

/**
 * Delete a scene from the database
 * Note: This now uses database operations, not metadata JSON
 */
async function deletePodcast42SceneApi(params: {
	storyId: string;
	sceneId: string;
}): Promise<DeleteSceneResponse> {
	// Delete scene files from storage
	await deletePodcast42SceneFilesApi(params);
	return { success: true };
}

/**
 * Hook to delete a scene from podcast42
 */
export function useDeletePodcast42Scene() {
	return useMutation({
		mutationFn: (params: { storyId: string; sceneId: string }) =>
			deletePodcast42SceneApi(params),
	});
}

interface UpdateSceneResponse {
	success: boolean;
	error?: string;
}

/**
 * Update a scene's properties (caption, speaker, etc.)
 */
async function updatePodcast42SceneApi(params: {
	storyId: string;
	sceneId: string;
	updates: { caption?: string; speaker?: "person1" | "person2" };
}): Promise<UpdateSceneResponse> {
	const { storyId, sceneId, updates } = params;

	// First get current metadata
	const getResponse = await authFetch(`/api/story-metadata?storyId=${storyId}`);
	const getData = await getResponse.json();

	if (!getData.success || !getData.metadata) {
		return { success: false, error: "Failed to get current metadata" };
	}

	// Update the specific scene
	const updatedScenes = getData.metadata.scenes.map(
		(scene: { id: string; caption: string; speaker: string }) =>
			scene.id === sceneId ? { ...scene, ...updates } : scene,
	);

	// Save updated metadata
	const updatedMetadata = {
		...getData.metadata,
		scenes: updatedScenes,
	};

	const saveResponse = await authFetch("/api/story-metadata", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ metadata: updatedMetadata }),
	});
	return saveResponse.json();
}

/**
 * Hook to update a scene's properties
 */
export function useUpdatePodcast42Scene() {
	return useMutation({
		mutationFn: updatePodcast42SceneApi,
	});
}

/**
 * Reorder scenes in the story
 */
async function reorderPodcast42ScenesApi(params: {
	storyId: string;
	fromIndex: number;
	toIndex: number;
}): Promise<UpdateSceneResponse> {
	const { storyId, fromIndex, toIndex } = params;

	// First get current metadata
	const getResponse = await authFetch(`/api/story-metadata?storyId=${storyId}`);
	const getData = await getResponse.json();

	if (!getData.success || !getData.metadata) {
		return { success: false, error: "Failed to get current metadata" };
	}

	// Reorder scenes
	const newScenes = [...getData.metadata.scenes];
	const [moved] = newScenes.splice(fromIndex, 1);
	newScenes.splice(toIndex, 0, moved);

	// Save updated metadata
	const updatedMetadata = {
		...getData.metadata,
		scenes: newScenes,
	};

	const saveResponse = await authFetch("/api/story-metadata", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ metadata: updatedMetadata }),
	});
	return saveResponse.json();
}

/**
 * Hook to reorder scenes
 */
export function useReorderPodcast42Scenes() {
	return useMutation({
		mutationFn: reorderPodcast42ScenesApi,
	});
}
