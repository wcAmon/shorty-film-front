import { useEffect } from "react";
import { toast } from "@/components/ui/sonner";

/**
 * Global error handler hook that catches:
 * - Unhandled promise rejections
 * - Uncaught runtime errors
 *
 * This complements ErrorBoundary which only catches render errors.
 */
export function useGlobalErrorHandler() {
	useEffect(() => {
		// Handle unhandled promise rejections (async errors)
		const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
			event.preventDefault();

			const error = event.reason;
			const message =
				error instanceof Error
					? error.message
					: typeof error === "string"
						? error
						: "An unexpected error occurred";

			console.error("[GlobalErrorHandler] Unhandled rejection:", error);

			// Don't show toast for certain expected errors
			if (shouldIgnoreError(message)) {
				return;
			}

			toast.error("Operation failed", {
				description: message,
				duration: 5000,
			});
		};

		// Handle uncaught errors (event handler errors, etc.)
		const handleError = (event: ErrorEvent) => {
			// Prevent default browser error handling
			event.preventDefault();

			console.error("[GlobalErrorHandler] Uncaught error:", event.error);

			const message = event.error?.message || event.message || "An unexpected error occurred";

			// Don't show toast for certain expected errors
			if (shouldIgnoreError(message)) {
				return;
			}

			toast.error("Something went wrong", {
				description: message,
				duration: 5000,
			});
		};

		window.addEventListener("unhandledrejection", handleUnhandledRejection);
		window.addEventListener("error", handleError);

		return () => {
			window.removeEventListener("unhandledrejection", handleUnhandledRejection);
			window.removeEventListener("error", handleError);
		};
	}, []);
}

/**
 * Check if an error should be ignored (not shown to user)
 */
function shouldIgnoreError(message: string): boolean {
	const ignoredPatterns = [
		// Network errors that are expected during navigation
		"Failed to fetch",
		"NetworkError",
		"AbortError",
		// Chrome extension errors
		"chrome-extension://",
		// React dev mode warnings
		"ResizeObserver loop",
		// Cancelled requests
		"The operation was aborted",
		"signal is aborted",
	];

	return ignoredPatterns.some((pattern) =>
		message.toLowerCase().includes(pattern.toLowerCase()),
	);
}
