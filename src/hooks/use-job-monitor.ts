import { useEffect, useState, useCallback, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseClient } from "@/lib/supabase-client";

// Job status type matching backend
export type JobStatus = "pending" | "processing" | "completed" | "failed";
export type MediaType = "image" | "audio" | "video";

// Job record type
export interface Job {
	id: string;
	ownerId: string;
	mediaType: MediaType;
	mediaId: string;
	storyId: string;
	sceneId: string;
	status: JobStatus;
	externalRequestId?: string;
	errorMessage?: string;
	retryCount: number;
	metadata?: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
	completedAt?: string;
}

// Job change event
export interface JobChangeEvent {
	eventType: "INSERT" | "UPDATE" | "DELETE";
	job: Job;
	oldJob?: Job;
}

// Hook options
export interface UseJobMonitorOptions {
	ownerId?: string;
	storyId?: string;
	sceneId?: string;
	mediaType?: MediaType;
	onJobChange?: (event: JobChangeEvent) => void;
}

/**
 * Hook to monitor jobs table via Supabase Realtime.
 * Subscribes to postgres_changes for the jobs table filtered by owner_id.
 */
export function useJobMonitor(options: UseJobMonitorOptions = {}) {
	const { ownerId, storyId, sceneId, mediaType, onJobChange } = options;
	const [jobs, setJobs] = useState<Job[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const channelRef = useRef<RealtimeChannel | null>(null);

	// Fetch initial jobs
	const fetchJobs = useCallback(async () => {
		if (!ownerId) {
			setJobs([]);
			setIsLoading(false);
			return;
		}

		setIsLoading(true);
		setError(null);

		try {
			let query = supabaseClient
				.schema("shorty")
				.from("jobs")
				.select("*")
				.eq("owner_id", ownerId)
				.order("created_at", { ascending: false });

			if (storyId) {
				query = query.eq("story_id", storyId);
			}
			if (sceneId) {
				query = query.eq("scene_id", sceneId);
			}
			if (mediaType) {
				query = query.eq("media_type", mediaType);
			}

			const { data, error: fetchError } = await query;

			if (fetchError) {
				throw new Error(fetchError.message);
			}

			// Convert snake_case to camelCase
			const formattedJobs = (data || []).map(formatJob);
			setJobs(formattedJobs);
		} catch (err) {
			console.error("[useJobMonitor] Error fetching jobs:", err);
			setError(err instanceof Error ? err.message : "Failed to fetch jobs");
		} finally {
			setIsLoading(false);
		}
	}, [ownerId, storyId, sceneId, mediaType]);

	// Subscribe to realtime changes
	useEffect(() => {
		if (!ownerId) return;

		// Fetch initial data
		fetchJobs();

		// Create realtime subscription
		const channel = supabaseClient
			.channel(`jobs:${ownerId}`)
			.on(
				"postgres_changes",
				{
					event: "*",
					schema: "shorty",
					table: "jobs",
					filter: `owner_id=eq.${ownerId}`,
				},
				(payload) => {
					const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
					const newRecord = payload.new as Record<string, unknown> | null;
					const oldRecord = payload.old as Record<string, unknown> | null;

					// Filter by storyId/sceneId/mediaType if specified
					if (newRecord) {
						if (storyId && newRecord.story_id !== storyId) return;
						if (sceneId && newRecord.scene_id !== sceneId) return;
						if (mediaType && newRecord.media_type !== mediaType) return;
					}

					const job = newRecord ? formatJob(newRecord) : null;
					const oldJob = oldRecord ? formatJob(oldRecord) : undefined;

					if (job) {
						// Update local state
						setJobs((prevJobs) => {
							switch (eventType) {
								case "INSERT":
									return [job, ...prevJobs];
								case "UPDATE":
									return prevJobs.map((j) => (j.id === job.id ? job : j));
								case "DELETE":
									return prevJobs.filter((j) => j.id !== job.id);
								default:
									return prevJobs;
							}
						});

						// Notify callback
						if (onJobChange) {
							onJobChange({ eventType, job, oldJob });
						}
					}
				},
			)
			.subscribe();

		channelRef.current = channel;

		// Cleanup on unmount
		return () => {
			if (channelRef.current) {
				supabaseClient.removeChannel(channelRef.current);
				channelRef.current = null;
			}
		};
	}, [ownerId, storyId, sceneId, mediaType, onJobChange, fetchJobs]);

	// Get jobs by status
	const pendingJobs = jobs.filter((j) => j.status === "pending");
	const processingJobs = jobs.filter((j) => j.status === "processing");
	const completedJobs = jobs.filter((j) => j.status === "completed");
	const failedJobs = jobs.filter((j) => j.status === "failed");

	// Get job by ID
	const getJobById = useCallback(
		(jobId: string) => jobs.find((j) => j.id === jobId),
		[jobs],
	);

	// Get job by media ID
	const getJobByMediaId = useCallback(
		(mediaId: string) => jobs.find((j) => j.mediaId === mediaId),
		[jobs],
	);

	// Get jobs by scene ID
	const getJobsBySceneId = useCallback(
		(targetSceneId: string) => jobs.filter((j) => j.sceneId === targetSceneId),
		[jobs],
	);

	return {
		jobs,
		isLoading,
		error,
		pendingJobs,
		processingJobs,
		completedJobs,
		failedJobs,
		getJobById,
		getJobByMediaId,
		getJobsBySceneId,
		refetch: fetchJobs,
	};
}

// Helper to convert snake_case DB record to camelCase Job
function formatJob(record: Record<string, unknown>): Job {
	return {
		id: record.id as string,
		ownerId: record.owner_id as string,
		mediaType: record.media_type as MediaType,
		mediaId: record.media_id as string,
		storyId: record.story_id as string,
		sceneId: record.scene_id as string,
		status: record.status as JobStatus,
		externalRequestId: record.external_request_id as string | undefined,
		errorMessage: record.error_message as string | undefined,
		retryCount: (record.retry_count as number) || 0,
		metadata: record.metadata as Record<string, unknown> | undefined,
		createdAt: record.created_at as string,
		updatedAt: record.updated_at as string,
		completedAt: record.completed_at as string | undefined,
	};
}

/**
 * Hook to monitor a single job by ID.
 * Uses polling as a simpler alternative to realtime for single job monitoring.
 */
export function useJobStatus(jobId: string | null, pollInterval = 2000) {
	const [job, setJob] = useState<Job | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!jobId) {
			setJob(null);
			setIsLoading(false);
			return;
		}

		let isMounted = true;
		let timeoutId: NodeJS.Timeout | null = null;

		const fetchJob = async () => {
			try {
				const { data, error: fetchError } = await supabaseClient
					.schema("shorty")
					.from("jobs")
					.select("*")
					.eq("id", jobId)
					.single();

				if (!isMounted) return;

				if (fetchError) {
					throw new Error(fetchError.message);
				}

				const formattedJob = formatJob(data);
				setJob(formattedJob);
				setIsLoading(false);

				// Continue polling if job is not in terminal state
				if (
					formattedJob.status === "pending" ||
					formattedJob.status === "processing"
				) {
					timeoutId = setTimeout(fetchJob, pollInterval);
				}
			} catch (err) {
				if (!isMounted) return;
				console.error("[useJobStatus] Error fetching job:", err);
				setError(err instanceof Error ? err.message : "Failed to fetch job");
				setIsLoading(false);
			}
		};

		fetchJob();

		return () => {
			isMounted = false;
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};
	}, [jobId, pollInterval]);

	return {
		job,
		isLoading,
		error,
		isCompleted: job?.status === "completed",
		isFailed: job?.status === "failed",
		isProcessing: job?.status === "pending" || job?.status === "processing",
	};
}
