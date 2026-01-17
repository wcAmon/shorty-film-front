import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { ArrowLeft, Mic } from "lucide-react";
import { useEffect } from "react";
import { authStore } from "@/stores/auth.store";
import { podcast42Actions } from "@/stores/podcast42.store";

export const Route = createFileRoute("/podcast42")({
	component: Podcast42Layout,
});

// Layout component for Podcast42 pages
function Podcast42Layout() {
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
			<div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
				<div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
			</div>
		);
	}

	// Don't render content if not authenticated (will redirect)
	if (!isAuthenticated) {
		return null;
	}

	const handleBack = () => {
		podcast42Actions.reset();
		navigate({ to: "/" });
	};

	return (
		<div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 py-12 px-6">
			<div className="max-w-4xl mx-auto">
				{/* Back button */}
				<button
					type="button"
					onClick={handleBack}
					className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
				>
					<ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
					Back to Home
				</button>

				{/* Page title */}
				<div className="text-center mb-10">
					<div className="flex items-center justify-center gap-3 mb-2">
						<Mic className="w-8 h-8 text-amber-400" />
						<h1 className="text-4xl font-bold text-white">Podcast 42</h1>
					</div>
					<p className="text-slate-400">
						Generate podcast-style videos with two characters
					</p>
				</div>

				{/* Child route content */}
				<Outlet />
			</div>
		</div>
	);
}
