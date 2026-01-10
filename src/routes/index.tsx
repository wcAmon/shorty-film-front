import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

// Home page component: Shows AI story button
function Home() {
	return (
		<div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
			<div className="text-center">
				<Link
					to="/aistory"
					className="group inline-flex items-center gap-3 px-12 py-6 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white text-2xl font-bold rounded-2xl transition-all duration-300 shadow-2xl shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:scale-105"
				>
					<Sparkles className="w-8 h-8 group-hover:animate-pulse" />
					AI story
				</Link>
			</div>
		</div>
	);
}
