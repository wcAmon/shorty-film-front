import { Component, type ReactNode, type ErrorInfo } from "react";
import { toast } from "@/components/ui/sonner";

interface Props {
	children: ReactNode;
	fallback?: ReactNode;
}

interface State {
	hasError: boolean;
	error: Error | null;
}

/**
 * Error Boundary component that catches render errors
 * and displays them as toast notifications.
 *
 * Note: Error Boundaries only catch errors in:
 * - Render methods
 * - Lifecycle methods
 * - Constructors of the whole tree below them
 *
 * They do NOT catch errors in:
 * - Event handlers (use try/catch)
 * - Async code (use global error handler)
 * - Server-side rendering
 */
export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		// Log to console for debugging
		console.error("[ErrorBoundary] Caught error:", error);
		console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);

		// Show toast notification
		toast.error("Something went wrong", {
			description: error.message || "An unexpected error occurred",
			duration: 5000,
		});
	}

	render(): ReactNode {
		if (this.state.hasError) {
			// You can render any custom fallback UI
			if (this.props.fallback) {
				return this.props.fallback;
			}

			// Default fallback: try to recover by re-rendering children
			// This allows the app to continue working in many cases
			return this.props.children;
		}

		return this.props.children;
	}
}
