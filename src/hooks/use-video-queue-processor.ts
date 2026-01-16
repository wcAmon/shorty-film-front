import { useEffect, useRef } from "react";
import { useStore } from "@tanstack/react-store";
import {
	podcast42Actions,
	podcast42Store,
	type Podcast42VideoEngine,
} from "@/stores/podcast42.store";

// API functions (copied from use-podcast42-api.ts to avoid circular deps)
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

/**
 * Hook to process video generation queue sequentially.
 * Watches the videoQueue in store and processes one scene at a time.
 */
export function useVideoQueueProcessor() {
	const videoQueue = useStore(podcast42Store, (state) => state.videoQueue);
	const currentProcessingSceneId = useStore(
		podcast42Store,
		(state) => state.currentProcessingSceneId,
	);
	const scenes = useStore(podcast42Store, (state) => state.scenes);
	const storyId = useStore(podcast42Store, (state) => state.storyId);
	const person1ImageUrl = useStore(
		podcast42Store,
		(state) => state.person1ImageUrl,
	);
	const person2ImageUrl = useStore(
		podcast42Store,
		(state) => state.person2ImageUrl,
	);
	const videoEngine = useStore(podcast42Store, (state) => state.videoEngine);

	// Ref to track if we're currently processing
	const isProcessingRef = useRef(false);

	useEffect(() => {
		// If already processing or no items in queue, skip
		if (isProcessingRef.current || videoQueue.length === 0) {
			return;
		}

		// If there's a current processing scene, skip (shouldn't happen but safety check)
		if (currentProcessingSceneId) {
			return;
		}

		const processNextInQueue = async () => {
			// Get the first scene ID from queue
			const sceneId = videoQueue[0];
			if (!sceneId || !storyId) return;

			// Find the scene
			const scene = scenes.find((s) => s.id === sceneId);
			const sceneIndex = scenes.findIndex((s) => s.id === sceneId);

			if (!scene || sceneIndex === -1) {
				// Scene not found, remove from queue
				podcast42Actions.removeFromVideoQueue(sceneId);
				return;
			}

			// Check prerequisites
			if (!scene.audioBase64) {
				podcast42Actions.removeFromVideoQueue(sceneId);
				podcast42Actions.updateScene(sceneId, {
					videoError: "Audio is required. Generate audio first.",
				});
				return;
			}

			const imageUrl =
				scene.speaker === "person1" ? person1ImageUrl : person2ImageUrl;
			if (!imageUrl) {
				podcast42Actions.removeFromVideoQueue(sceneId);
				podcast42Actions.updateScene(sceneId, {
					videoError: `${scene.speaker === "person1" ? "Person 1" : "Person 2"} image is required.`,
				});
				return;
			}

			// Mark as processing
			isProcessingRef.current = true;
			podcast42Actions.setCurrentProcessingSceneId(sceneId);
			podcast42Actions.removeFromVideoQueue(sceneId);
			podcast42Actions.updateScene(sceneId, {
				isGeneratingVideo: true,
				videoError: null,
			});

			try {
				// Submit the job
				const submitResult = await submitPodcast42VideoJobApi({
					storyId,
					sceneIndex,
					imageUrl,
					audioBase64: scene.audioBase64,
					videoEngine,
				});

				if (!submitResult.success) {
					throw new Error(submitResult.error || "Failed to submit video job");
				}

				// Poll for completion
				const pollInterval = 5000; // 5 seconds
				const maxAttempts = 120; // 10 minutes max
				let attempts = 0;

				while (attempts < maxAttempts) {
					await new Promise((resolve) => setTimeout(resolve, pollInterval));
					attempts++;

					const statusResult = await checkPodcast42VideoStatusApi({
						storyId,
						sceneIndex,
					});

					console.log(
						`[video-queue] Scene ${sceneId} status: ${statusResult.status}`,
					);

					if (statusResult.status === "completed") {
						podcast42Actions.updateScene(sceneId, {
							videoBase64: statusResult.videoBase64,
							videoDuration: statusResult.videoDuration,
							isGeneratingVideo: false,
							videoError: null,
							// Store the index used for video file naming so export can find it
							videoIndex: sceneIndex,
						});
						break;
					}

					if (statusResult.status === "failed") {
						throw new Error(statusResult.error || "Video generation failed");
					}

					// Continue polling if still processing
				}

				// Check if we timed out
				if (attempts >= maxAttempts) {
					throw new Error("Video generation timed out");
				}
			} catch (err) {
				console.error("[video-queue] Error processing scene:", err);
				podcast42Actions.updateScene(sceneId, {
					isGeneratingVideo: false,
					videoError:
						err instanceof Error ? err.message : "Video generation failed",
				});
			} finally {
				// Done processing, clear current and allow next
				podcast42Actions.setCurrentProcessingSceneId(null);
				isProcessingRef.current = false;
			}
		};

		processNextInQueue();
	}, [
		videoQueue,
		currentProcessingSceneId,
		scenes,
		storyId,
		person1ImageUrl,
		person2ImageUrl,
		videoEngine,
	]);

	return {
		queueLength: videoQueue.length,
		isProcessing: currentProcessingSceneId !== null,
		currentProcessingSceneId,
	};
}
