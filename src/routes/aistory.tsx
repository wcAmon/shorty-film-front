import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { aistoryActions } from "@/stores/aistory.store";
import { authStore } from "@/stores/auth.store";

export const Route = createFileRoute("/aistory")({
	component: AIStoryLayout,
});

// Layout component for AI Story pages
function AIStoryLayout() {
	const navigate = useNavigate();
	const { isAuthenticated, isLoading } = useStore(authStore);

	// Redirect to home if not authenticated
	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			navigate({ to: "/" });
		}
	}, [isAuthenticated, isLoading, navigate]);

	// Show loading while checking auth
	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
			</div>
		);
	}

	// Don't render content if not authenticated (will redirect)
	if (!isAuthenticated) {
		return null;
	}

	const handleBack = () => {
		aistoryActions.reset();
		navigate({ to: "/" });
	};

	return (
		<div className="min-h-screen bg-background px-6 py-12">
			<div className="mx-auto max-w-4xl">
				{/* Back button */}
				<Button
					variant="ghost"
					onClick={handleBack}
					className="group mb-6 gap-2 text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="h-5 w-5 transition-transform group-hover:-translate-x-1" />
					Back to Home
				</Button>

				{/* Page title */}
				<div className="mb-10 text-center">
					<div className="mb-2 flex items-center justify-center gap-3">
						<Sparkles className="h-8 w-8 text-cyan-500" />
						<h1 className="text-4xl font-bold text-foreground">
							AI Story Generator
						</h1>
					</div>
					<p className="text-muted-foreground">
						Transform your narrative into engaging short-form videos
					</p>
				</div>

				{/* Child route content */}
				<Outlet />
			</div>
		</div>
	);
}
