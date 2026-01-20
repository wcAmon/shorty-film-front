import { Store } from "@tanstack/store";

// Queue item type
export interface QueueItem {
	id: string;
	sceneId: string;
	mediaType: "audio" | "image" | "video";
	status: "queued" | "processing";
	queuePosition: number;
}

// Queue state per scene per media type
interface GenerationQueueState {
	// Map: sceneId -> mediaType -> QueueItem[]
	queues: Record<string, Record<string, QueueItem[]>>;
}

const initialState: GenerationQueueState = {
	queues: {},
};

export const generationQueueStore = new Store<GenerationQueueState>(
	initialState,
);

export const generationQueueActions = {
	// Add request to queue, returns the queue item id
	enqueue: (
		sceneId: string,
		mediaType: "audio" | "image" | "video",
	): string => {
		const queueItemId = `${sceneId}-${mediaType}-${Date.now()}`;

		generationQueueStore.setState((state) => {
			const sceneQueues = state.queues[sceneId] || {};
			const mediaQueue = sceneQueues[mediaType] || [];

			const newItem: QueueItem = {
				id: queueItemId,
				sceneId,
				mediaType,
				status: mediaQueue.length === 0 ? "processing" : "queued",
				queuePosition: mediaQueue.length + 1,
			};

			return {
				...state,
				queues: {
					...state.queues,
					[sceneId]: {
						...sceneQueues,
						[mediaType]: [...mediaQueue, newItem],
					},
				},
			};
		});

		return queueItemId;
	},

	// Complete current item and start next, returns the next item if any
	completeAndNext: (
		sceneId: string,
		mediaType: "audio" | "image" | "video",
	): QueueItem | null => {
		let nextItem: QueueItem | null = null;

		generationQueueStore.setState((state) => {
			const sceneQueues = state.queues[sceneId] || {};
			const mediaQueue = sceneQueues[mediaType] || [];

			if (mediaQueue.length === 0) {
				return state;
			}

			// Remove completed item (first in queue)
			const updatedQueue = mediaQueue.slice(1);

			// Update positions and get next item
			const reindexedQueue = updatedQueue.map((item, index) => {
				if (index === 0) {
					nextItem = {
						...item,
						status: "processing" as const,
						queuePosition: 1,
					};
					return nextItem;
				}
				return { ...item, queuePosition: index + 1 };
			});

			return {
				...state,
				queues: {
					...state.queues,
					[sceneId]: {
						...sceneQueues,
						[mediaType]: reindexedQueue,
					},
				},
			};
		});

		return nextItem;
	},

	// Cancel a queued item (can only cancel items that are not processing)
	cancelQueued: (
		sceneId: string,
		mediaType: "audio" | "image" | "video",
		queueItemId: string,
	): void => {
		generationQueueStore.setState((state) => {
			const sceneQueues = state.queues[sceneId] || {};
			const mediaQueue = sceneQueues[mediaType] || [];

			// Can only cancel queued items, not processing ones
			const filteredQueue = mediaQueue.filter(
				(item) => item.id !== queueItemId || item.status === "processing",
			);
			const reindexedQueue = filteredQueue.map((item, index) => ({
				...item,
				queuePosition: index + 1,
			}));

			return {
				...state,
				queues: {
					...state.queues,
					[sceneId]: {
						...sceneQueues,
						[mediaType]: reindexedQueue,
					},
				},
			};
		});
	},

	// Get queue length for a scene+mediaType
	getQueueLength: (
		sceneId: string,
		mediaType: "audio" | "image" | "video",
	): number => {
		const state = generationQueueStore.state;
		return state.queues[sceneId]?.[mediaType]?.length || 0;
	},

	// Get queue items for a scene+mediaType
	getQueueItems: (
		sceneId: string,
		mediaType: "audio" | "image" | "video",
	): QueueItem[] => {
		const state = generationQueueStore.state;
		return state.queues[sceneId]?.[mediaType] || [];
	},

	// Check if currently processing for a scene+mediaType
	isProcessing: (
		sceneId: string,
		mediaType: "audio" | "image" | "video",
	): boolean => {
		const state = generationQueueStore.state;
		const queue = state.queues[sceneId]?.[mediaType] || [];
		return queue.length > 0 && queue[0].status === "processing";
	},

	// Check if there are queued items (not including current processing)
	hasQueuedItems: (
		sceneId: string,
		mediaType: "audio" | "image" | "video",
	): boolean => {
		const state = generationQueueStore.state;
		const queue = state.queues[sceneId]?.[mediaType] || [];
		return queue.filter((item) => item.status === "queued").length > 0;
	},

	// Clear all queues for a scene
	clearSceneQueues: (sceneId: string): void => {
		generationQueueStore.setState((state) => {
			const { [sceneId]: _, ...remainingQueues } = state.queues;
			return {
				queues: remainingQueues,
			};
		});
	},

	// Clear all queues (reset)
	clearAllQueues: (): void => {
		generationQueueStore.setState(() => initialState);
	},
};
