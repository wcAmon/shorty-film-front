import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, FolderOpen, Mic, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

// Home page component: Shows AI story, Podcast42, and History buttons
function Home() {
	return (
		<div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center gap-8">
			<div className="flex flex-col sm:flex-row gap-6">
				<Link
					to="/aistory"
					className="group inline-flex items-center gap-3 px-12 py-6 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white text-2xl font-bold rounded-2xl transition-all duration-300 shadow-2xl shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:scale-105"
				>
					<Sparkles className="w-8 h-8 group-hover:animate-pulse" />
					AI story
				</Link>
				<Link
					to="/podcast42"
					className="group inline-flex items-center gap-3 px-12 py-6 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-2xl font-bold rounded-2xl transition-all duration-300 shadow-2xl shadow-amber-500/30 hover:shadow-amber-500/50 hover:scale-105"
				>
					<Mic className="w-8 h-8 group-hover:animate-pulse" />
					Podcast 42
				</Link>
			</div>
			<div className="flex flex-col sm:flex-row gap-4">
				<Link
					to="/history"
					className="group inline-flex items-center gap-2 px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white text-lg font-medium rounded-xl transition-all duration-300 border border-slate-600 hover:border-slate-500"
				>
					<Clock className="w-5 h-5" />
					History
				</Link>
				<Link
					to="/asset-library"
					className="group inline-flex items-center gap-2 px-6 py-3 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white text-lg font-medium rounded-xl transition-all duration-300 border border-slate-600 hover:border-slate-500"
				>
					<FolderOpen className="w-5 h-5" />
					Asset Library
				</Link>
			</div>
		</div>
	);
}
