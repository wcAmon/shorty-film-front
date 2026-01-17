import OpenAI, { toFile } from "openai";
import type {
	ChatCompletion,
	ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import type { FileObject } from "openai/resources/files";
import type {
	ImageGenerateParams,
	ImagesResponse,
} from "openai/resources/images";
import type {
	Response as OpenAIResponse,
	ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";

// Re-export OpenAI types and utilities
export { OpenAI, toFile };

/**
 * Semaphore class for limiting concurrent operations
 */
class Semaphore {
	private permits: number;
	private waitQueue: Array<() => void> = [];

	constructor(permits: number) {
		this.permits = permits;
	}

	async acquire(): Promise<void> {
		if (this.permits > 0) {
			this.permits--;
			return;
		}

		// Wait for a permit to become available
		return new Promise<void>((resolve) => {
			this.waitQueue.push(resolve);
		});
	}

	release(): void {
		const next = this.waitQueue.shift();
		if (next) {
			// Give permit to next waiting request
			next();
		} else {
			// Return permit to pool
			this.permits++;
		}
	}

	/**
	 * Execute a function with semaphore protection
	 */
	async withPermit<T>(fn: () => T | Promise<T>): Promise<Awaited<T>> {
		await this.acquire();
		try {
			return await fn();
		} finally {
			this.release();
		}
	}

	/**
	 * Get current available permits (for debugging)
	 */
	get availablePermits(): number {
		return this.permits;
	}

	/**
	 * Get current queue length (for debugging)
	 */
	get queueLength(): number {
		return this.waitQueue.length;
	}
}

// Maximum concurrent OpenAI requests
const MAX_CONCURRENT_OPENAI_REQUESTS = 5;

// Semaphore for rate limiting OpenAI API calls
const openaiSemaphore = new Semaphore(MAX_CONCURRENT_OPENAI_REQUESTS);

// Singleton OpenAI client instance
let openaiInstance: OpenAI | null = null;

/**
 * Get the singleton OpenAI client instance
 */
function getOpenAIClient(): OpenAI {
	if (!openaiInstance) {
		openaiInstance = new OpenAI({
			apiKey: process.env.OPENAI_API_KEY,
		});
	}
	return openaiInstance;
}

/**
 * OpenAI client wrapper with built-in semaphore protection
 * Uses non-streaming types for all API methods
 */
export const openai = {
	/**
	 * Get the raw OpenAI client (use with caution - no semaphore protection)
	 */
	get raw(): OpenAI {
		return getOpenAIClient();
	},

	/**
	 * Chat completions with semaphore protection (non-streaming)
	 */
	chat: {
		completions: {
			create: (
				params: ChatCompletionCreateParamsNonStreaming,
			): Promise<ChatCompletion> => {
				return openaiSemaphore.withPermit(() =>
					getOpenAIClient().chat.completions.create(params),
				);
			},
		},
	},

	/**
	 * Image generation with semaphore protection
	 */
	images: {
		generate: (params: ImageGenerateParams): Promise<ImagesResponse> => {
			return openaiSemaphore.withPermit(async () => {
				const result = await getOpenAIClient().images.generate(params);
				return result as ImagesResponse;
			});
		},
	},

	/**
	 * Responses API with semaphore protection (non-streaming)
	 */
	responses: {
		create: (
			params: ResponseCreateParamsNonStreaming,
		): Promise<OpenAIResponse> => {
			return openaiSemaphore.withPermit(async () => {
				const result = await getOpenAIClient().responses.create(params);
				return result as OpenAIResponse;
			});
		},
		retrieve: (
			responseId: string,
			options?: Parameters<typeof OpenAI.prototype.responses.retrieve>[1],
		): Promise<OpenAIResponse> => {
			return openaiSemaphore.withPermit(async () => {
				const result = await getOpenAIClient().responses.retrieve(
					responseId,
					options,
				);
				return result as OpenAIResponse;
			});
		},
	},

	/**
	 * Files API with semaphore protection
	 */
	files: {
		create: (
			params: Parameters<typeof OpenAI.prototype.files.create>[0],
		): Promise<FileObject> => {
			return openaiSemaphore.withPermit(() =>
				getOpenAIClient().files.create(params),
			);
		},
	},

	/**
	 * Get semaphore stats for monitoring
	 */
	getStats: () => ({
		availablePermits: openaiSemaphore.availablePermits,
		queueLength: openaiSemaphore.queueLength,
		maxPermits: MAX_CONCURRENT_OPENAI_REQUESTS,
	}),
};

/**
 * Helper to check if an error is an OpenAI safety rejection
 */
export function isOpenAISafetyRejection(
	err: InstanceType<typeof OpenAI.APIError>,
): boolean {
	const message = err.message?.toLowerCase() ?? "";
	const code = (err as unknown as { error?: { code?: string } }).error?.code;
	return (
		code === "content_policy_violation" ||
		message.includes("rejected by the safety system") ||
		message.includes("safety system") ||
		message.includes("content policy")
	);
}
