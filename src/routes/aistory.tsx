import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";
import { aistoryActions } from "@/stores/aistory.store";

export const Route = createFileRoute("/aistory")({
	component: AIStoryLayout,
});

// Layout component for AI Story pages
function AIStoryLayout() {
	const navigate = useNavigate();

	const handleBack = () => {
		aistoryActions.reset();
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
						<Sparkles className="w-8 h-8 text-purple-400" />
						<h1 className="text-4xl font-bold text-white">
							AI Story Generator
						</h1>
					</div>
					<p className="text-slate-400">
						Transform your narrative into engaging short-form videos
					</p>
				</div>

				{/* Child route content */}
				<Outlet />
			</div>
		</div>
	);
}
