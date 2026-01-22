import { useMutation } from "@tanstack/react-query";
import { logger } from "@/lib/logger";
import { supabaseClient } from "@/lib/supabase-client";
import { authFetch } from "./use-auth";
import type {
	DirectorImageEngine,
	DirectorVideoEngine,
	DirectorAvatarEngine,
	DirectorImageStyle,
	DirectorVoiceId,
	DirectorCaptionLanguage,
	DirectorWordTimestamp,
} from "@/stores/director.store";

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
	// Story-specific data (for director-mode story generation)
	title?: string;
	characterPrompt?: string;
	scenes?: DirectorScene[];
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
				// Story-specific data (for director-mode story generation)
				title: result.job.title,
				characterPrompt: result.job.characterPrompt,
				scenes: result.job.scenes,
			},
		};
	} catch (err) {
		logger.error("[director:fetchJobStatus]", "Error:", err);
		return {
			success: false,
			error: err instanceof Error ? err.message : "Failed to fetch job status",
		};
	}
}

/**
 * Wait for job completion using Supabase Realtime CDC with exponential backoff polling fallback
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

		const log = logger.module(`[director:waitForJobCompletion:${jobId}]`);
		log.debug("Creating channel");

		// Create channel for this job
		const channel = supabaseClient.channel(`director-job-${jobId}`);

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

		// Listen for postgres_changes events
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
				log.debug("Realtime event:", payload.eventType);

				const errors = (payload as Record<string, unknown>).errors as
					| unknown[]
					| undefined;
				if (errors && errors.length > 0) {
					log.warn("Realtime RLS error:", errors);
					realtimeActive = false;
					return;
				}

				const row = payload.new as JobRowFromRealtime;
				if (row) {
					log.debug("Realtime job status:", row.status);

					if (row.status === "completed" || row.status === "failed") {
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
							handleJobStatus(normalizeJobRow(row));
						}
					} else {
						handleJobStatus(normalizeJobRow(row));
					}
				}
			},
		);

		// Subscribe and conditionally start polling fallback
		channel.subscribe(async (status, err) => {
			log.debug("Subscription:", status);

			if (status === "SUBSCRIBED") {
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

export interface DirectorScene {
	id: string;
	caption: string;
	prompt: string;
	video_prompt: string;
}

// API Response types
interface GenerateDirectorPromptsResponse {
	success: boolean;
	storyId?: string;
	title?: string;
	characterPrompt?: string;
	scenes?: DirectorScene[];
	error?: string;
}

interface GenerateDirectorCharacterResponse {
	success: boolean;
	imageId?: string;
	imageUrl?: string;
	error?: string;
}

interface UploadDirectorCharacterResponse {
	success: boolean;
	imageId?: string;
	imageUrl?: string;
	error?: string;
}

interface GenerateDirectorSceneImageResponse {
	success: boolean;
	imageId?: string;
	imageUrl?: string;
	error?: string;
}

interface GenerateDirectorSceneAudioResponse {
	success: boolean;
	audioId?: string;
	audioUrl?: string;
	wordTimestamps?: DirectorWordTimestamp[];
	audioDuration?: number;
	error?: string;
}

interface GenerateDirectorSceneVideoResponse {
	success: boolean;
	status: "pending" | "processing" | "completed" | "failed";
	videoId?: string;
	videoUrl?: string;
	videoDuration?: number;
	error?: string;
}

interface ExportDirectorVideoResponse {
	success: boolean;
	videoUrl?: string;
	error?: string;
}

interface UpdateDirectorSceneResponse {
	success: boolean;
	error?: string;
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

// ============================================================================
// API Functions
// ============================================================================

/**
 * Generate prompts for director-mode story
 * Creates story, character prompt, and scenes with prompts
 */
async function generateDirectorPromptsApi(params: {
	script: string;
	imageStyle?: DirectorImageStyle;
	imageEngine?: DirectorImageEngine;
	llmEngine?: "gpt-4.1" | "claude-opus-4-5";
	voiceId?: DirectorVoiceId;
	videoEngine?: DirectorVideoEngine;
	captionLanguage?: DirectorCaptionLanguage;
	onStatusUpdate?: (status: JobStatus) => void;
}): Promise<GenerateDirectorPromptsResponse> {
	const { onStatusUpdate, ...submitParams } = params;

	// Step 1: Submit job to backend
	const response = await authFetch("/api/generate-prompts", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			...submitParams,
			storyType: "director-mode", // Mark as director-mode story
		}),
	});

	const submitResult: SubmitJobResponse = await response.json();

	if (!submitResult.success || !submitResult.jobId) {
		return {
			success: false,
			error: submitResult.error || "Failed to submit director-mode story job",
		};
	}

	logger.debug(
		"[generateDirectorPromptsApi]",
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
			error: jobResult.error || "Director-mode story generation failed",
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

/**
 * Generate character image for director-mode (16:9 aspect ratio)
 */
async function generateDirectorCharacterApi(params: {
	prompt: string;
	storyId: string;
	imageEngine?: DirectorImageEngine;
	imageStyle?: DirectorImageStyle;
	onStatusUpdate?: (status: JobStatus) => void;
}): Promise<GenerateDirectorCharacterResponse> {
	const { onStatusUpdate, ...submitParams } = params;

	// Step 1: Submit job to backend with 16:9 aspect ratio
	const response = await authFetch("/api/generate-character", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			...submitParams,
			aspectRatio: "16:9", // Director mode uses landscape format
		}),
	});

	const submitResult: SubmitJobResponse = await response.json();

	if (!submitResult.success || !submitResult.jobId || !submitResult.mediaId) {
		return {
			success: false,
			error: submitResult.error || "Failed to submit character generation job",
		};
	}

	logger.debug(
		"[generateDirectorCharacterApi]",
		`Job submitted: ${submitResult.jobId}, mediaId: ${submitResult.mediaId}`,
	);

	// Step 2: Wait for job completion
	const jobResult = await waitForJobCompletion(submitResult.jobId, {
		timeoutMs: 360000, // 6 minutes max for image generation
		onStatusUpdate,
	});

	if (!jobResult.success || !jobResult.job) {
		return {
			success: false,
			error: jobResult.error || "Character generation failed",
		};
	}

	return {
		success: true,
		imageId: jobResult.job.mediaId,
		imageUrl: jobResult.job.mediaUrl || undefined,
	};
}

/**
 * Upload character image for director-mode (accepts 16:9 cropped image)
 */
async function uploadDirectorCharacterApi(params: {
	imageBase64: string;
	storyId: string;
}): Promise<UploadDirectorCharacterResponse> {
	const response = await authFetch("/api/upload-character", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			...params,
			person: "character", // Director mode uses single character
		}),
	});
	return response.json();
}

/**
 * Generate scene image for director-mode (16:9 aspect ratio)
 * Uses per-scene image engine setting
 */
async function generateDirectorSceneImageApi(params: {
	prompt: string;
	storyId: string;
	sceneId: string;
	characterImageUrl?: string;
	imageEngine?: DirectorImageEngine;
	onStatusUpdate?: (status: JobStatus) => void;
}): Promise<GenerateDirectorSceneImageResponse> {
	const { onStatusUpdate, ...submitParams } = params;

	// Step 1: Submit job to backend with 16:9 aspect ratio
	const response = await authFetch("/api/generate-scene-image", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			...submitParams,
			isCharacter: false, // Director mode scenes are not character-only
			aspectRatio: "16:9", // Director mode uses landscape format
		}),
	});

	const submitResult: SubmitJobResponse = await response.json();

	if (!submitResult.success || !submitResult.jobId || !submitResult.mediaId) {
		return {
			success: false,
			error: submitResult.error || "Failed to submit scene image job",
		};
	}

	logger.debug(
		"[generateDirectorSceneImageApi]",
		`Job submitted: ${submitResult.jobId}, mediaId: ${submitResult.mediaId}`,
	);

	// Step 2: Wait for job completion
	const jobResult = await waitForJobCompletion(submitResult.jobId, {
		timeoutMs: 360000, // 6 minutes max for image generation
		onStatusUpdate,
	});

	if (!jobResult.success || !jobResult.job) {
		return {
			success: false,
			error: jobResult.error || "Scene image generation failed",
		};
	}

	return {
		success: true,
		imageId: jobResult.job.mediaId,
		imageUrl: jobResult.job.mediaUrl || undefined,
	};
}

/**
 * Generate scene audio for director-mode
 * Uses per-scene voice settings
 */
async function generateDirectorSceneAudioApi(params: {
	caption: string;
	storyId: string;
	sceneId: string;
	voiceId?: DirectorVoiceId;
	voiceSpeed?: number;
	onStatusUpdate?: (status: JobStatus) => void;
}): Promise<GenerateDirectorSceneAudioResponse> {
	const { onStatusUpdate, ...submitParams } = params;

	logger.debug(
		"[generateDirectorSceneAudioApi]",
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
	logger.debug("[generateDirectorSceneAudioApi]", "Submit result:", submitResult);

	if (!submitResult.success || !submitResult.jobId || !submitResult.mediaId) {
		logger.error("[generateDirectorSceneAudioApi]", "Submit failed:", submitResult);
		return {
			success: false,
			error: submitResult.error || "Failed to submit audio job",
		};
	}

	logger.debug(
		"[generateDirectorSceneAudioApi]",
		`Job submitted: ${submitResult.jobId}, mediaId: ${submitResult.mediaId}`,
	);

	// Step 2: Wait for job completion
	logger.debug("[generateDirectorSceneAudioApi]", "Waiting for job completion...");
	const jobResult = await waitForJobCompletion(submitResult.jobId, {
		timeoutMs: 300000, // 5 minutes max
		onStatusUpdate,
	});

	logger.debug("[generateDirectorSceneAudioApi]", "Job result:", jobResult);

	if (!jobResult.success || !jobResult.job) {
		logger.error("[generateDirectorSceneAudioApi]", "Job failed:", jobResult);
		return {
			success: false,
			error: jobResult.error || "Audio generation failed",
		};
	}

	const job = jobResult.job;

	// Parse word timestamps from JSON string
	let wordTimestamps: DirectorWordTimestamp[] | undefined;
	if (job.wordTimestamps) {
		try {
			const parsed = JSON.parse(job.wordTimestamps);
			wordTimestamps = parsed.map(
				(wt: { word: string; start?: number; end?: number; startTime?: number; endTime?: number }) => ({
					word: wt.word,
					startTime: wt.startTime ?? wt.start ?? 0,
					endTime: wt.endTime ?? wt.end ?? 0,
				}),
			);
		} catch (e) {
			logger.error(
				"[generateDirectorSceneAudioApi]",
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

/**
 * Generate scene video for director-mode (regular video engine)
 * Uses per-scene video engine setting
 */
async function generateDirectorSceneVideoApi(params: {
	storyId: string;
	sceneId: string;
	videoPrompt: string;
	imageUrl: string;
	audioUrl: string;
	audioDuration: number;
	imageId: string;
	audioId: string;
	videoEngine?: DirectorVideoEngine;
	onStatusUpdate?: (status: JobStatus) => void;
}): Promise<GenerateDirectorSceneVideoResponse> {
	const { onStatusUpdate, ...submitParams } = params;

	logger.debug(
		"[generateDirectorSceneVideoApi]",
		"Starting with params:",
		submitParams,
	);

	// Step 1: Submit job to backend
	const response = await authFetch("/api/generate-scene-video", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			...submitParams,
			aspectRatio: "16:9", // Director mode uses landscape format
		}),
	});

	const submitResult: SubmitJobResponse = await response.json();
	logger.debug("[generateDirectorSceneVideoApi]", "Submit result:", submitResult);

	const jobId = submitResult.jobId;

	if (!submitResult.success || !jobId) {
		return {
			success: false,
			status: "failed",
			error: submitResult.error || "Failed to submit video job",
		};
	}

	logger.debug("[generateDirectorSceneVideoApi]", `Job submitted: ${jobId}`);

	// Step 2: Wait for job completion
	const jobResult = await waitForJobCompletion(jobId, {
		timeoutMs: 600000, // 10 minutes max for video generation
		onStatusUpdate,
	});

	logger.debug("[generateDirectorSceneVideoApi]", "Job result:", jobResult);

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

/**
 * Generate avatar video for director-mode (using character image + audio)
 * Uses per-scene avatar engine setting (omnihuman or aurora)
 */
async function generateDirectorAvatarVideoApi(params: {
	storyId: string;
	sceneId: string;
	characterImageUrl: string;
	avatarEngine?: DirectorAvatarEngine;
	onStatusUpdate?: (status: JobStatus) => void;
}): Promise<GenerateDirectorSceneVideoResponse> {
	const { onStatusUpdate, ...submitParams } = params;

	logger.debug(
		"[generateDirectorAvatarVideoApi]",
		"Starting with params:",
		submitParams,
	);

	// Step 1: Submit avatar video job (same as podcast42)
	const response = await authFetch("/api/podcast42-generate-video", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			storyId: submitParams.storyId,
			sceneId: submitParams.sceneId,
			imageUrl: submitParams.characterImageUrl,
			avatarEngine: submitParams.avatarEngine || "kling-avatar-v2-standard",
		}),
	});

	const submitResult: SubmitJobResponse = await response.json();
	logger.debug("[generateDirectorAvatarVideoApi]", "Submit result:", submitResult);

	if (!submitResult.success) {
		return {
			success: false,
			status: "failed",
			error: submitResult.error || "Failed to submit avatar video job",
		};
	}

	// Step 2: Poll for completion (avatar video uses polling)
	let attempts = 0;
	const maxAttempts = 120; // 10 minutes max
	const pollInterval = 5000; // 5 seconds

	while (attempts < maxAttempts) {
		await new Promise((resolve) => setTimeout(resolve, pollInterval));
		attempts++;

		const statusResponse = await authFetch("/api/podcast42-generate-video", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				storyId: submitParams.storyId,
				sceneId: submitParams.sceneId,
			}),
		});

		const statusResult = await statusResponse.json();

		if (onStatusUpdate) {
			onStatusUpdate(statusResult.status);
		}

		if (statusResult.status === "completed") {
			return {
				success: true,
				status: "completed",
				videoId: statusResult.videoId,
				videoUrl: statusResult.videoUrl,
				videoDuration: statusResult.videoDuration,
			};
		}

		if (statusResult.status === "failed") {
			return {
				success: false,
				status: "failed",
				error: statusResult.error || "Avatar video generation failed",
			};
		}
	}

	return {
		success: false,
		status: "failed",
		error: "Avatar video generation timed out",
	};
}

/**
 * Export final video for director-mode (16:9 aspect ratio)
 */
async function exportDirectorVideoApi(params: {
	storyId: string;
	subtitleData?: SubtitleExportData | null;
	onStatusUpdate?: (status: JobStatus) => void;
}): Promise<ExportDirectorVideoResponse> {
	const { storyId, subtitleData, onStatusUpdate } = params;

	// Step 1: Submit export job to backend with 16:9 aspect ratio
	const submitResponse = await authFetch("/api/export-video", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			storyId,
			subtitleData,
			aspectRatio: "16:9", // Director mode uses landscape format
		}),
	});
	const submitResult: SubmitJobResponse = await submitResponse.json();

	if (!submitResult.success || !submitResult.jobId) {
		return {
			success: false,
			error: submitResult.error || "Failed to submit export job",
		};
	}

	logger.debug("[exportDirectorVideoApi]", `Job submitted: ${submitResult.jobId}`);

	// Step 2: Wait for job completion using Realtime
	const completionResult = await waitForJobCompletion(submitResult.jobId, {
		timeoutMs: 600000, // 10 minute timeout for export
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
 * Update scene in database (caption, prompts, per-scene engine settings)
 */
async function updateDirectorSceneApi(params: {
	sceneId: string;
	updates: {
		caption?: string;
		imagePrompt?: string;
		videoPrompt?: string;
		imageEngine?: DirectorImageEngine;
		videoEngine?: DirectorVideoEngine;
		avatarEngine?: DirectorAvatarEngine | null;
		voiceId?: DirectorVoiceId;
		voiceSpeed?: number;
	};
}): Promise<UpdateDirectorSceneResponse> {
	const { sceneId, updates } = params;

	// Update scene caption if provided
	if (updates.caption !== undefined) {
		const captionResponse = await authFetch("/api/update-scene-caption", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sceneId, caption: updates.caption }),
		});
		const captionResult = await captionResponse.json();
		if (!captionResult.success) {
			return { success: false, error: captionResult.error };
		}
	}

	// Update scene prompts if provided
	if (updates.imagePrompt !== undefined || updates.videoPrompt !== undefined) {
		const promptResponse = await authFetch("/api/update-scene-prompt", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sceneId,
				prompt: updates.imagePrompt,
				videoPrompt: updates.videoPrompt,
			}),
		});
		const promptResult = await promptResponse.json();
		if (!promptResult.success) {
			return { success: false, error: promptResult.error };
		}
	}

	// Update scene voice settings if provided
	if (updates.voiceId !== undefined || updates.voiceSpeed !== undefined) {
		const voiceResponse = await authFetch("/api/update-scene-voice", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sceneId,
				voiceId: updates.voiceId,
				voiceSpeed: updates.voiceSpeed,
			}),
		});
		const voiceResult = await voiceResponse.json();
		if (!voiceResult.success) {
			return { success: false, error: voiceResult.error };
		}
	}

	// Update per-scene engine settings if provided
	if (
		updates.imageEngine !== undefined ||
		updates.videoEngine !== undefined ||
		updates.avatarEngine !== undefined
	) {
		const engineResponse = await authFetch("/api/update-scene-engines", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sceneId,
				imageEngine: updates.imageEngine,
				videoEngine: updates.videoEngine,
				avatarEngine: updates.avatarEngine,
			}),
		});
		const engineResult = await engineResponse.json();
		if (!engineResult.success) {
			return { success: false, error: engineResult.error };
		}
	}

	return { success: true };
}

/**
 * Reorder scenes in database
 */
async function reorderDirectorScenesApi(params: {
	storyId: string;
	sceneOrder: Array<{ sceneId: string; orderIndex: number }>;
}): Promise<UpdateDirectorSceneResponse> {
	const response = await authFetch("/api/reorder-scenes", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

/**
 * Update story-level settings (default engines)
 */
async function updateDirectorStorySettingsApi(params: {
	storyId: string;
	imageEngine?: DirectorImageEngine;
	imageStyle?: DirectorImageStyle;
	videoEngine?: DirectorVideoEngine;
	avatarEngine?: DirectorAvatarEngine;
	voiceId?: DirectorVoiceId;
}): Promise<UpdateDirectorSceneResponse> {
	const response = await authFetch("/api/update-story-settings", {
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
 * Hook to generate prompts from a script for director-mode
 */
export function useGenerateDirectorPrompts() {
	return useMutation({
		mutationFn: generateDirectorPromptsApi,
	});
}

/**
 * Hook to generate character image for director-mode (16:9)
 */
export function useGenerateDirectorCharacter() {
	return useMutation({
		mutationFn: (params: {
			prompt: string;
			storyId: string;
			imageEngine?: DirectorImageEngine;
			imageStyle?: DirectorImageStyle;
			onStatusUpdate?: (status: JobStatus) => void;
		}) => generateDirectorCharacterApi(params),
	});
}

/**
 * Hook to upload character image for director-mode
 */
export function useUploadDirectorCharacter() {
	return useMutation({
		mutationFn: uploadDirectorCharacterApi,
	});
}

/**
 * Hook to generate scene image for director-mode (16:9)
 * Uses per-scene image engine setting
 */
export function useGenerateDirectorSceneImage() {
	return useMutation({
		mutationFn: (params: {
			prompt: string;
			storyId: string;
			sceneId: string;
			characterImageUrl?: string;
			imageEngine?: DirectorImageEngine;
			onStatusUpdate?: (status: JobStatus) => void;
		}) => generateDirectorSceneImageApi(params),
	});
}

/**
 * Hook to generate scene audio for director-mode
 * Uses per-scene voice settings
 */
export function useGenerateDirectorSceneAudio() {
	return useMutation({
		mutationFn: (params: {
			caption: string;
			storyId: string;
			sceneId: string;
			voiceId?: DirectorVoiceId;
			voiceSpeed?: number;
			onStatusUpdate?: (status: JobStatus) => void;
		}) => generateDirectorSceneAudioApi(params),
	});
}

/**
 * Hook to generate scene video for director-mode (regular video engine)
 * Uses per-scene video engine setting
 */
export function useGenerateDirectorSceneVideo() {
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
			videoEngine?: DirectorVideoEngine;
			onStatusUpdate?: (status: JobStatus) => void;
		}) => generateDirectorSceneVideoApi(params),
	});
}

/**
 * Hook to generate avatar video for director-mode (omnihuman/aurora)
 * Uses per-scene avatar engine setting
 */
export function useGenerateDirectorAvatarVideo() {
	return useMutation({
		mutationFn: (params: {
			storyId: string;
			sceneId: string;
			characterImageUrl: string;
			avatarEngine?: DirectorAvatarEngine;
			onStatusUpdate?: (status: JobStatus) => void;
		}) => generateDirectorAvatarVideoApi(params),
	});
}

/**
 * Hook to export final video for director-mode (16:9)
 */
export function useExportDirectorVideo() {
	return useMutation({
		mutationFn: (params: {
			storyId: string;
			subtitleData?: SubtitleExportData | null;
			onStatusUpdate?: (status: JobStatus) => void;
		}) => exportDirectorVideoApi(params),
	});
}

/**
 * Hook to update scene (caption, prompts, per-scene engine settings)
 */
export function useUpdateDirectorScene() {
	return useMutation({
		mutationFn: updateDirectorSceneApi,
	});
}

/**
 * Hook to reorder scenes
 */
export function useReorderDirectorScenes() {
	return useMutation({
		mutationFn: reorderDirectorScenesApi,
	});
}

/**
 * Hook to update story-level settings (default engines)
 */
export function useUpdateDirectorStorySettings() {
	return useMutation({
		mutationFn: updateDirectorStorySettingsApi,
	});
}

/**
 * Update story title API
 */
async function updateStoryTitleApi(params: {
	storyId: string;
	title: string;
}): Promise<{ success: boolean; error?: string }> {
	const response = await authFetch("/api/director/update-title", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

/**
 * Hook to update story title
 */
export function useUpdateStoryTitle() {
	return useMutation({
		mutationFn: updateStoryTitleApi,
	});
}

// ============================================================================
// Create Director Mode Story
// ============================================================================

interface CreateDirectorStoryResponse {
	success: boolean;
	storyId?: string;
	error?: string;
}

/**
 * Create an empty director-mode story
 */
async function createDirectorStoryApi(params: {
	title?: string;
	imageEngine?: string;
	imageStyle?: string;
	voiceId?: string;
	videoEngine?: string;
}): Promise<CreateDirectorStoryResponse> {
	const response = await authFetch("/api/director/create-story", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(params),
	});
	return response.json();
}

/**
 * Hook to create an empty director-mode story
 */
export function useCreateDirectorStory() {
	return useMutation({
		mutationFn: createDirectorStoryApi,
	});
}
