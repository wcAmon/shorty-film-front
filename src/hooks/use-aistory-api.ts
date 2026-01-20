import { useMutation } from "@tanstack/react-query";
import { logger } from "@/lib/logger";
import { supabaseClient } from "@/lib/supabase-client";
import { authFetch } from "./use-auth";

// ============================================================================
// Job Polling Types and Utilities
// ============================================================================

type JobStatus = "pending" | "processing" | "completed" | "failed";
type MediaType = "image" | "audio" | "video" | "story";

// Supabase Realtime returns snake_case field names
interface JobRowFromRealtime {
	id: string;
	status: JobStatus;
	media_type: MediaType;
	media_id: string;
	story_id: string;
	scene_id: string;
	error_message: string | null;
	created_at: string;
	updated_at: string;
	completed_at: string | null;
}

interface JobRecord {
	id: string;
	status: JobStatus;
	mediaType?: MediaType;
	mediaId: string;
	storyId?: string;
	sceneId?: string;
	errorMessage: string | null;
	// Media data (included when job is completed)
	mediaUrl?: string | null;
	duration?: number | null;
	wordTimestamps?: string | null;
	// Story-specific data (for aistory story generation)
	title?: string;
	characterPrompt?: string;
	scenes?: Scene[];
}

// Backend job submission response
interface SubmitJobResponse {
	success: boolean;
	jobId?: string;
	mediaId?: string;
	status?: string;
	error?: string;
}

/**
 * Convert snake_case job row to camelCase
 */
function normalizeJobRow(row: JobRowFromRealtime): JobRecord {
	return {
		id: row.id,
		status: row.status,
		mediaType: row.media_type,
		mediaId: row.media_id,
		storyId: row.story_id,
		sceneId: row.scene_id,
		errorMessage: row.error_message,
	};
}

/**
 * Fetch job status via API route (calls backend, includes media data when completed)
 */
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
				// Media data from backend (when job is completed)
				mediaUrl: result.job.mediaUrl,
				duration: result.job.duration,
				wordTimestamps: result.job.wordTimestamps,
				// Story-specific data (for aistory story generation)
				title: result.job.title,
				characterPrompt: result.job.characterPrompt,
				scenes: result.job.scenes,
			},
		};
	} catch (err) {
		logger.error("[fetchJobStatus]", "Error:", err);
		return {
			success: false,
			error: err instanceof Error ? err.message : "Failed to fetch job status",
		};
	}
}

/**
 * Wait for job completion using Supabase Realtime CDC
 * Reference: https://supabase.com/docs/guides/realtime/postgres-changes
 *
 * Handles race condition: checks initial status after subscription is established
 * in case the job completed before we started listening.
 */
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
		let pollingTimeoutId: ReturnType<typeof setTimeout> | null = null;
		let currentPollDelay = 2000; // Start at 2 seconds
		const maxPollDelay = 30000; // Cap at 30 seconds
		const backoffMultiplier = 2; // Double each time

		const log = logger.module(`[waitForJobCompletion:${jobId}]`);
		log.debug("Creating channel");

		// Create channel for this job
		const channel = supabaseClient.channel(`job-${jobId}`);

		const cleanup = () => {
			log.debug("Cleaning up...");
			if (pollingTimeoutId) {
				clearTimeout(pollingTimeoutId);
				pollingTimeoutId = null;
			}
			channel.unsubscribe();
		};

		const handleJobStatus = (job: JobRecord) => {
			log.debug("handleJobStatus:", job.status, "mediaUrl:", job.mediaUrl);
			onStatusUpdate?.(job.status);

			if (job.status === "completed") {
				log.debug("Job completed!");
				if (!resolved) {
					resolved = true;
					clearTimeout(timeoutId);
					cleanup();
					resolve({ success: true, job });
				}
			} else if (job.status === "failed") {
				log.warn("Job failed!");
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

		// Fallback polling function with exponential backoff
		const pollJobStatus = async () => {
			if (resolved) return;

			const result = await fetchJobStatus(jobId);
			if (result.success && result.job) {
				log.debug(
					`Poll result: ${result.job.status} (next poll in ${currentPollDelay / 1000}s)`,
				);
				handleJobStatus(result.job);
			}

			// Schedule next poll with exponential backoff
			if (!resolved) {
				pollingTimeoutId = setTimeout(pollJobStatus, currentPollDelay);
				// Increase delay for next poll (exponential backoff)
				currentPollDelay = Math.min(
					currentPollDelay * backoffMultiplier,
					maxPollDelay,
				);
			}
		};

		// Start polling with exponential backoff
		const startPolling = () => {
			if (pollingTimeoutId || resolved) return;
			log.info(
				`Starting polling with exponential backoff (${currentPollDelay / 1000}s -> ${maxPollDelay / 1000}s max)`,
			);
			pollJobStatus();
		};

		// Set up timeout
		const timeoutId = setTimeout(() => {
			if (!resolved) {
				log.error("Timeout reached!");
				resolved = true;
				cleanup();
				resolve({ success: false, error: "Job completion timed out" });
			}
		}, timeoutMs);

		// Track if Realtime is delivering events
		let realtimeActive = false;

		// Listen for postgres_changes events (may fail due to RLS, but we have polling fallback)
		// IMPORTANT: Use filter to only listen to this specific job's changes
		// This prevents cross-talk between multiple concurrent job listeners
		channel.on(
			"postgres_changes",
			{
				event: "*",
				schema: "shorty",
				table: "jobs",
				filter: `id=eq.${jobId}`,
			},
			async (payload) => {
				realtimeActive = true; // Mark Realtime as working
				log.debug("Realtime event:", payload.eventType);

				// Check for RLS errors (empty payload with errors)
				const errors = (payload as Record<string, unknown>).errors as
					| unknown[]
					| undefined;
				if (errors && errors.length > 0) {
					log.warn("Realtime RLS error:", errors);
					realtimeActive = false; // RLS error means Realtime won't work
					return;
				}

				const row = payload.new as JobRowFromRealtime;
				if (row) {
					log.debug("Realtime job status:", row.status);

					if (row.status === "completed" || row.status === "failed") {
						// Realtime only has job data, not media URL
						// Fetch full job status via API to get mediaUrl
						log.debug("Fetching full job status with media URL...");
						const fullStatus = await fetchJobStatus(jobId);
						if (fullStatus.success && fullStatus.job) {
							log.debug(
								"Full status:",
								fullStatus.job.status,
								"mediaUrl:",
								fullStatus.job.mediaUrl,
							);
							handleJobStatus(fullStatus.job);
						} else {
							// Fallback to Realtime data (without mediaUrl)
							handleJobStatus(normalizeJobRow(row));
						}
					} else {
						// For pending/processing, just use Realtime data
						handleJobStatus(normalizeJobRow(row));
					}
				}
			},
		);

		// Subscribe and conditionally start polling fallback
		channel.subscribe(async (status, err) => {
			log.debug("Subscription:", status);

			if (status === "SUBSCRIBED") {
				// Check initial status (job might have completed before we subscribed)
				const initialStatus = await fetchJobStatus(jobId);
				log.debug(
					"Initial:",
					initialStatus.job?.status,
					"url:",
					initialStatus.job?.mediaUrl,
				);

				if (initialStatus.success && initialStatus.job) {
					handleJobStatus(initialStatus.job);
				}

				// Wait 15 seconds, then start polling ONLY if Realtime hasn't delivered any events
				// This reduces server load when Realtime is working properly
				if (!resolved) {
					log.debug("Waiting 15s to check if Realtime is working...");
					setTimeout(() => {
						log.debug(
							`15s check - resolved: ${resolved}, realtimeActive: ${realtimeActive}, pollingActive: ${!!pollingTimeoutId}`,
						);
						if (!resolved && !realtimeActive && !pollingTimeoutId) {
							log.info(
								"No Realtime events after 15s, starting polling fallback...",
							);
							startPolling();
						}
					}, 15000);
				}
			} else if (status === "CHANNEL_ERROR") {
				log.error("Channel error:", err);
				// Start polling immediately on channel error
				if (!pollingTimeoutId && !resolved) {
					log.info("Starting polling due to channel error...");
					startPolling();
				}
			}
		});
	});
}

// ============================================================================
// Type Definitions
// ============================================================================

export type ImageStyle =
	| "cinematic"
	| "comic"
	| "low-poly"
	| "japanese-anime"
	| "clay";

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

// Image engine type - now only FAL-based engines
export type ImageEngine = "flux-pro" | "gpt-image-1.5" | "nano-banana-pro";

// LLM engine type for prompt generation
export type LLMEngine = "gpt-4.1" | "claude-opus-4-5";

// Caption language type
export type CaptionLanguage = "en" | "zh-TW";

// Voice ID type
export type VoiceId = string;

// API Response types
interface GeneratePromptsResponse {
	success: boolean;
	storyId?: string;
	title?: string;
	characterPrompt?: string;
	scenes?: Scene[];
	error?: string;
}

interface GenerateCharacterResponse {
	success: boolean;
	imageId?: string; // Database image ID
	imageUrl?: string; // Supabase Storage URL (used by all FAL engines)
	error?: string;
}

interface UploadCharacterResponse {
	success: boolean;
	imageId?: string; // Database image ID
	imageUrl?: string; // Supabase Storage URL (can be used directly by FAL AI)
	error?: string;
}

interface GenerateSceneImageResponse {
	success: boolean;
	imageId?: string; // Database image ID
	imageUrl?: string; // Supabase Storage URL
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
	jobId?: string; // Job ID for tracking
	requestId?: string; // Legacy field (same as jobId)
	mediaId?: string; // Database video ID
	videoId?: string; // Legacy field (same as mediaId)
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

// Export video API types (now returns jobId for monitoring)
interface ExportVideoSubmitResponse {
	success: boolean;
	jobId?: string;
	mediaId?: string; // The export video ID
	status?: string;
	error?: string;
}

interface ExportVideoCompletedResponse {
	success: boolean;
	videoUrl?: string;
	error?: string;
}

// ============================================================================
// Generic Job Submit and Wait Utility
// ============================================================================

interface SubmitAndWaitOptions {
	/** API endpoint to submit job to */
	endpoint: string;
	/** Request body (will be JSON stringified) */
	body: Record<string, unknown>;
	/** Timeout in milliseconds */
	timeoutMs?: number;
	/** Callback for job status updates */
	onStatusUpdate?: (status: JobStatus) => void;
	/** Whether mediaId is required in submit response */
	requireMediaId?: boolean;
	/** Error message prefix for logging */
	logPrefix?: string;
}

interface SubmitAndWaitResult {
	success: boolean;
	jobId?: string;
	mediaId?: string;
	job?: JobRecord;
	error?: string;
}

/**
 * 通用的 job 提交和等待函數
 * 將重複的 submit -> wait -> fetch status 邏輯封裝
 */
async function submitAndWaitForJob(
	options: SubmitAndWaitOptions,
): Promise<SubmitAndWaitResult> {
	const {
		endpoint,
		body,
		timeoutMs = 300000,
		onStatusUpdate,
		requireMediaId = true,
		logPrefix = "[submitAndWaitForJob]",
	} = options;

	// Step 1: Submit job to backend
	const response = await authFetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	const submitResult: SubmitJobResponse = await response.json();

	if (
		!submitResult.success ||
		!submitResult.jobId ||
		(requireMediaId && !submitResult.mediaId)
	) {
		return {
			success: false,
			error: submitResult.error || "Failed to submit job",
		};
	}

	logger.debug(
		logPrefix,
		`Job submitted: ${submitResult.jobId}, mediaId: ${submitResult.mediaId}`,
	);

	// Step 2: Wait for job completion via Supabase Realtime
	const jobResult = await waitForJobCompletion(submitResult.jobId, {
		timeoutMs,
		onStatusUpdate,
	});

	if (!jobResult.success) {
		return {
			success: false,
			error: jobResult.error || "Job failed",
		};
	}

	return {
		success: true,
		jobId: submitResult.jobId,
		mediaId: submitResult.mediaId,
		job: jobResult.job,
	};
}

// ============================================================================
// API Functions
// ============================================================================

async function generatePromptsApi(params: {
	script: string;
	imageStyle?: ImageStyle;
	imageEngine?: ImageEngine;
	llmEngine?: LLMEngine;
	voiceId?: string;
	videoEngine?: string;
	captionLanguage?: CaptionLanguage;
	onStatusUpdate?: (status: JobStatus) => void;
}): Promise<GeneratePromptsResponse> {
	const { onStatusUpdate, ...submitParams } = params;

	// Step 1: Submit job to backend
	const response = await authFetch("/api/generate-prompts", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(submitParams),
	});

	const submitResult: SubmitJobResponse = await response.json();

	if (!submitResult.success || !submitResult.jobId) {
		return {
			success: false,
			error: submitResult.error || "Failed to submit story job",
		};
	}

	logger.debug(
		"[generatePromptsApi]",
		`Job submitted: ${submitResult.jobId}, storyId: ${submitResult.mediaId}`,
	);

	// Step 2: Wait for job completion via Supabase Realtime
	const jobResult = await waitForJobCompletion(submitResult.jobId, {
		timeoutMs: 120000, // 2 minutes max for prompt generation
		onStatusUpdate,
	});

	if (!jobResult.success) {
		return {
			success: false,
			error: jobResult.error || "Story generation failed",
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

	const job = fullStatus.job;

	return {
		success: true,
		storyId: job.storyId || submitResult.mediaId,
		title: job.title,
		characterPrompt: job.characterPrompt,
		scenes: job.scenes,
	};
}

async function generateCharacterApi(params: {
	prompt: string;
	storyId: string;
	imageEngine?: ImageEngine;
	imageStyle?: ImageStyle;
	onStatusUpdate?: (status: JobStatus) => void;
}): Promise<GenerateCharacterResponse> {
	const { onStatusUpdate, ...submitParams } = params;

	const result = await submitAndWaitForJob({
		endpoint: "/api/generate-character",
		body: submitParams,
		timeoutMs: 360000, // 6 minutes max for image generation
		onStatusUpdate,
		logPrefix: "[generateCharacterApi]",
	});

	if (!result.success || !result.job) {
		return {
			success: false,
			error: result.error || "Character generation failed",
		};
	}

	return {
		success: true,
		imageId: result.job.mediaId,
		imageUrl: result.job.mediaUrl || undefined,
	};
}

async function uploadCharacterApi(params: {
	imageBase64: string;
	storyId?: string;
	person?: "character" | "person1" | "person2";
}): Promise<UploadCharacterResponse> {
	const response = await authFetch("/api/upload-character", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

async function generateSceneImageApi(params: {
	prompt: string;
	storyId: string;
	sceneId: string;
	isCharacter: boolean;
	characterImageUrl?: string; // Supabase Storage URL (used by all FAL engines)
	imageEngine?: ImageEngine;
	onStatusUpdate?: (status: JobStatus) => void;
}): Promise<GenerateSceneImageResponse> {
	const { onStatusUpdate, ...submitParams } = params;

	// Step 1: Submit job to backend
	const response = await authFetch("/api/generate-scene-image", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(submitParams),
	});

	const submitResult: SubmitJobResponse = await response.json();

	if (!submitResult.success || !submitResult.jobId || !submitResult.mediaId) {
		return {
			success: false,
			error: submitResult.error || "Failed to submit image job",
		};
	}

	logger.debug(
		"[generateSceneImageApi]",
		`Job submitted: ${submitResult.jobId}, mediaId: ${submitResult.mediaId}`,
	);

	// Step 2: Wait for job completion via Supabase Realtime
	// Job status includes media data when completed
	const jobResult = await waitForJobCompletion(submitResult.jobId, {
		timeoutMs: 360000, // 6 minutes max for image generation
		onStatusUpdate,
	});

	if (!jobResult.success || !jobResult.job) {
		return {
			success: false,
			error: jobResult.error || "Image generation failed",
		};
	}

	return {
		success: true,
		imageId: jobResult.job.mediaId,
		imageUrl: jobResult.job.mediaUrl || undefined,
	};
}

async function generateSceneAudioApi(params: {
	caption: string;
	storyId: string;
	sceneId: string;
	voiceId?: string;
	voiceSpeed?: number;
	onStatusUpdate?: (status: JobStatus) => void;
}): Promise<GenerateSceneAudioResponse> {
	const { onStatusUpdate, ...submitParams } = params;

	logger.debug(
		"[generateSceneAudioApi]",
		"Starting with params:",
		submitParams,
	);

	// Step 1: Submit job to backend
	const response = await authFetch("/api/generate-scene-audio", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(submitParams),
	});

	const submitResult: SubmitJobResponse = await response.json();
	logger.debug("[generateSceneAudioApi]", "Submit result:", submitResult);

	if (!submitResult.success || !submitResult.jobId || !submitResult.mediaId) {
		logger.error("[generateSceneAudioApi]", "Submit failed:", submitResult);
		return {
			success: false,
			error: submitResult.error || "Failed to submit audio job",
		};
	}

	logger.debug(
		"[generateSceneAudioApi]",
		`Job submitted: ${submitResult.jobId}, mediaId: ${submitResult.mediaId}`,
	);

	// Step 2: Wait for job completion via Supabase Realtime
	// When completed, fetch job status which includes media data
	logger.debug("[generateSceneAudioApi]", "Waiting for job completion...");
	const jobResult = await waitForJobCompletion(submitResult.jobId, {
		timeoutMs: 300000, // 5 minutes max
		onStatusUpdate,
	});

	logger.debug("[generateSceneAudioApi]", "Job result:", jobResult);

	if (!jobResult.success || !jobResult.job) {
		logger.error("[generateSceneAudioApi]", "Job failed:", jobResult);
		return {
			success: false,
			error: jobResult.error || "Audio generation failed",
		};
	}

	const job = jobResult.job;

	// Parse word timestamps from JSON string (backend returns it as string)
	let wordTimestamps: WordTimestamp[] | undefined;
	if (job.wordTimestamps) {
		try {
			wordTimestamps = JSON.parse(job.wordTimestamps);
		} catch (e) {
			logger.error(
				"[generateSceneAudioApi]",
				"Failed to parse word timestamps:",
				e,
			);
		}
	}

	return {
		success: true,
		audioId: job.mediaId,
		audioUrl: job.mediaUrl || undefined,
		audioDuration: job.duration || undefined,
		wordTimestamps,
	};
}

// Submit a video generation job (non-blocking)
async function submitVideoJobApi(params: {
	storyId: string;
	sceneId: string;
	videoPrompt: string;
	imageUrl: string;
	audioUrl: string;
	audioDuration: number;
	imageId: string;
	audioId: string;
	videoEngine?: string;
}): Promise<SubmitVideoJobResponse> {
	const response = await authFetch("/api/generate-scene-video", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

// Generate video using Supabase Realtime for job monitoring
async function generateSceneVideoApi(params: {
	storyId: string;
	sceneId: string;
	videoPrompt: string;
	imageUrl: string;
	audioUrl: string;
	audioDuration: number;
	imageId: string;
	audioId: string;
	videoEngine?: string;
	onStatusUpdate?: (status: JobStatus) => void;
}): Promise<CheckVideoStatusResponse> {
	const { onStatusUpdate, ...submitParams } = params;

	logger.debug(
		"[generateSceneVideoApi]",
		"Starting with params:",
		submitParams,
	);

	// Step 1: Submit job to backend
	const submitResult = await submitVideoJobApi(submitParams);
	logger.debug("[generateSceneVideoApi]", "Submit result:", submitResult);

	// Backend returns jobId
	const jobId = submitResult.jobId || submitResult.requestId;

	if (!submitResult.success || !jobId) {
		return {
			success: false,
			status: "failed",
			error: submitResult.error || "Failed to submit video job",
		};
	}
	logger.debug("[generateSceneVideoApi]", `Job submitted: ${jobId}`);

	// Step 2: Wait for job completion via Supabase Realtime
	const jobResult = await waitForJobCompletion(jobId, {
		timeoutMs: 600000, // 10 minutes max for video generation
		onStatusUpdate,
	});

	logger.debug("[generateSceneVideoApi]", "Job result:", jobResult);

	if (!jobResult.success || !jobResult.job) {
		return {
			success: false,
			status: "failed",
			error: jobResult.error || "Video generation failed",
		};
	}

	const job = jobResult.job;

	return {
		success: true,
		status: "completed",
		videoId: job.mediaId,
		videoUrl: job.mediaUrl || undefined,
		videoDuration: job.duration || undefined,
	};
}

// Legacy polling function (kept for backwards compatibility)
async function generateSceneVideoWithPolling(params: {
	storyId: string;
	sceneId: string;
	videoPrompt: string;
	imageUrl: string;
	audioUrl: string;
	audioDuration: number;
	imageId: string;
	audioId: string;
	videoEngine?: string;
	onStatusUpdate?: (
		status: "pending" | "processing" | "completed" | "failed",
	) => void;
	pollInterval?: number;
	maxAttempts?: number;
}): Promise<CheckVideoStatusResponse> {
	// Use new Realtime-based implementation
	return generateSceneVideoApi({
		storyId: params.storyId,
		sceneId: params.sceneId,
		videoPrompt: params.videoPrompt,
		imageUrl: params.imageUrl,
		audioUrl: params.audioUrl,
		audioDuration: params.audioDuration,
		imageId: params.imageId,
		audioId: params.audioId,
		videoEngine: params.videoEngine,
		onStatusUpdate: params.onStatusUpdate,
	});
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
 * Supports Flux Pro and GPT-Image-1.5 engines (both via FAL AI)
 */
export function useGenerateCharacter() {
	return useMutation({
		mutationFn: (params: {
			prompt: string;
			storyId: string;
			imageEngine?: ImageEngine;
			imageStyle?: ImageStyle;
		}) => generateCharacterApi(params),
	});
}

/**
 * Hook to upload a character image to Supabase Storage
 * Returns imageId and imageUrl that can be used directly by FAL AI
 */
export function useUploadCharacter() {
	return useMutation({
		mutationFn: uploadCharacterApi,
	});
}

/**
 * Hook to generate a scene image
 * Supports Flux Pro and GPT-Image-1.5 engines (both via FAL AI)
 * Returns imageId and imageUrl (Supabase Storage)
 */
export function useGenerateSceneImage() {
	return useMutation({
		mutationFn: (params: {
			prompt: string;
			storyId: string;
			sceneId: string;
			isCharacter: boolean;
			characterImageUrl?: string; // Supabase Storage URL (used by all FAL engines)
			imageEngine?: ImageEngine;
		}) => generateSceneImageApi(params),
	});
}

/**
 * Hook to generate scene audio with ElevenLabs
 * Supports voice selection via voiceId parameter and voiceSpeed (0.7-1.2)
 * Returns audioId and audioUrl (Supabase Storage)
 */
export function useGenerateSceneAudio() {
	return useMutation({
		mutationFn: (params: {
			caption: string;
			storyId: string;
			sceneId: string;
			voiceId?: string;
			voiceSpeed?: number;
		}) => generateSceneAudioApi(params),
	});
}

/**
 * Hook to generate scene video from image + prompt (with polling)
 * Uses queue-based API: submits job, then polls for completion
 * Returns videoId and videoUrl (Supabase Storage)
 */
export function useGenerateSceneVideo() {
	return useMutation({
		mutationFn: (params: {
			storyId: string;
			sceneId: string;
			videoPrompt: string;
			imageUrl: string;
			audioUrl: string;
			audioDuration: number;
			imageId: string;
			audioId: string;
			videoEngine?: string;
			onStatusUpdate?: (
				status: "pending" | "processing" | "completed" | "failed",
			) => void;
		}) => generateSceneVideoWithPolling(params),
	});
}

// Update scene caption API function
interface UpdateSceneCaptionResponse {
	success: boolean;
	error?: string;
}

async function updateSceneCaptionApi(params: {
	sceneId: string;
	caption: string;
}): Promise<UpdateSceneCaptionResponse> {
	const response = await authFetch("/api/update-scene-caption", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

// Subtitle export data type
interface SubtitleExportData {
	segments: Array<{
		text: string;
		absoluteStartTime: number;
		absoluteEndTime: number;
		color: string;
	}>;
	globalSize: "small" | "medium" | "large";
	globalPosition: "top" | "center" | "bottom";
}

// Export video API function - now submits job and waits for completion
async function exportVideoApi(params: {
	storyId: string;
	subtitleData?: SubtitleExportData | null;
	onStatusUpdate?: (status: JobStatus) => void;
}): Promise<ExportVideoCompletedResponse> {
	const { storyId, subtitleData, onStatusUpdate } = params;

	// Step 1: Submit export job to backend
	const submitResponse = await authFetch("/api/export-video", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ storyId, subtitleData }),
	});
	const submitResult: ExportVideoSubmitResponse = await submitResponse.json();

	if (!submitResult.success || !submitResult.jobId) {
		return {
			success: false,
			error: submitResult.error || "Failed to submit export job",
		};
	}

	logger.debug("[exportVideoApi]", `Job submitted: ${submitResult.jobId}`);

	// Step 2: Wait for job completion using Realtime
	const completionResult = await waitForJobCompletion(submitResult.jobId, {
		timeoutMs: 600000, // 10 minute timeout for export (may have many scenes)
		onStatusUpdate,
	});

	if (!completionResult.success) {
		return {
			success: false,
			error: completionResult.error || "Export job failed",
		};
	}

	// Step 3: Return the video URL
	return {
		success: true,
		videoUrl: completionResult.job?.mediaUrl || undefined,
	};
}

/**
 * Hook to export final video with all scenes combined
 * Submits job to backend and monitors completion via Realtime
 * Returns videoUrl (Supabase Storage)
 * Supports optional subtitle data for burned-in captions
 */
export function useExportVideo() {
	return useMutation({
		mutationFn: (params: {
			storyId: string;
			subtitleData?: SubtitleExportData | null;
			onStatusUpdate?: (status: JobStatus) => void;
		}) => exportVideoApi(params),
	});
}

/**
 * Hook to update scene caption in database
 * Used when user edits caption and wants to persist changes
 */
export function useUpdateSceneCaption() {
	return useMutation({
		mutationFn: (params: { sceneId: string; caption: string }) =>
			updateSceneCaptionApi(params),
	});
}

// Update scene voice settings API function
interface UpdateSceneVoiceResponse {
	success: boolean;
	error?: string;
}

async function updateSceneVoiceApi(params: {
	sceneId: string;
	voiceId?: string;
	voiceSpeed?: number;
}): Promise<UpdateSceneVoiceResponse> {
	const response = await authFetch("/api/update-scene-voice", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

/**
 * Hook to update scene voice settings (voiceId, voiceSpeed) in database
 * Used when user changes voice or speed in the scene editor
 */
export function useUpdateSceneVoice() {
	return useMutation({
		mutationFn: (params: {
			sceneId: string;
			voiceId?: string;
			voiceSpeed?: number;
		}) => updateSceneVoiceApi(params),
	});
}

// ============================================================================
// Story Settings API
// ============================================================================

interface UpdateStorySettingsResponse {
	success: boolean;
	error?: string;
}

async function updateStorySettingsApi(params: {
	storyId: string;
	imageEngine?: string;
	videoEngine?: string;
	voiceId?: string;
}): Promise<UpdateStorySettingsResponse> {
	const response = await authFetch("/api/update-story-settings", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

/**
 * Hook to update story settings (imageEngine, videoEngine, voiceId)
 * Used when user changes settings in the scene editor
 */
export function useUpdateStorySettings() {
	return useMutation({
		mutationFn: updateStorySettingsApi,
	});
}

// ============================================================================
// Media Status Polling (for resuming generation monitoring)
// ============================================================================

export type MediaStatusType = "ready" | "generating" | "completed";

interface MediaStatusResponse {
	success: boolean;
	mediaId?: string;
	mediaType?: "image" | "video" | "audio";
	status?: MediaStatusType;
	imageUrl?: string | null;
	videoUrl?: string | null;
	audioUrl?: string | null;
	duration?: number | null;
	error?: string;
}

/**
 * Fetch current media status from database
 */
export async function fetchMediaStatus(
	mediaType: "image" | "video" | "audio",
	mediaId: string,
): Promise<MediaStatusResponse> {
	try {
		const response = await authFetch(
			`/api/get-media-status?type=${mediaType}&mediaId=${mediaId}`,
		);
		return response.json();
	} catch (err) {
		return {
			success: false,
			error:
				err instanceof Error ? err.message : "Failed to fetch media status",
		};
	}
}

/**
 * Poll media status until it's completed or max attempts reached
 * Used when user returns to scene editor with generating media
 */
export async function pollMediaUntilReady(
	mediaType: "image" | "video" | "audio",
	mediaId: string,
	options: {
		pollInterval?: number;
		maxAttempts?: number;
		onStatusUpdate?: (status: MediaStatusType) => void;
	} = {},
): Promise<MediaStatusResponse> {
	const { pollInterval = 5000, maxAttempts = 120, onStatusUpdate } = options;

	let attempts = 0;

	while (attempts < maxAttempts) {
		const result = await fetchMediaStatus(mediaType, mediaId);

		if (!result.success) {
			logger.error(
				"[pollMediaUntilReady]",
				`Error polling ${mediaType}:`,
				result.error,
			);
			return result;
		}

		onStatusUpdate?.(result.status as MediaStatusType);

		// Check for completed status (generation finished)
		if (result.status === "completed") {
			logger.debug(
				"[pollMediaUntilReady]",
				`${mediaType} ${mediaId} is completed`,
			);
			return result;
		}

		logger.debug(
			"[pollMediaUntilReady]",
			`${mediaType} ${mediaId} status: ${result.status}, attempt ${attempts + 1}/${maxAttempts}`,
		);

		attempts++;
		await new Promise((resolve) => setTimeout(resolve, pollInterval));
	}

	return {
		success: false,
		error: `Timeout: ${mediaType} generation did not complete within ${(maxAttempts * pollInterval) / 1000}s`,
	};
}

// ============================================================================
// Scene Prompt Update API
// ============================================================================

interface UpdateScenePromptResponse {
	success: boolean;
	error?: string;
}

async function updateScenePromptApi(params: {
	sceneId: string;
	prompt?: string;
	videoPrompt?: string;
}): Promise<UpdateScenePromptResponse> {
	const response = await authFetch("/api/update-scene-prompt", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

/**
 * Hook to update scene prompts (image prompt, video prompt) in database
 * Used with debounce when user edits prompts in the scene editor
 */
export function useUpdateScenePrompt() {
	return useMutation({
		mutationFn: (params: {
			sceneId: string;
			prompt?: string;
			videoPrompt?: string;
		}) => updateScenePromptApi(params),
	});
}

// ============================================================================
// Scene Reorder API
// ============================================================================

interface ReorderScenesResponse {
	success: boolean;
	error?: string;
}

async function reorderScenesApi(params: {
	storyId: string;
	sceneOrder: Array<{ sceneId: string; orderIndex: number }>;
}): Promise<ReorderScenesResponse> {
	const response = await authFetch("/api/reorder-scenes", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

/**
 * Hook to reorder scenes in database
 * Used with debounce when user reorders scenes in the scene editor
 */
export function useReorderScenes() {
	return useMutation({
		mutationFn: (params: {
			storyId: string;
			sceneOrder: Array<{ sceneId: string; orderIndex: number }>;
		}) => reorderScenesApi(params),
	});
}
