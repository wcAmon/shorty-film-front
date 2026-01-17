import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Mic, Play, Sparkles, Zap } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { authStore } from "@/stores/auth.store";

export const Route = createFileRoute("/")({ component: Home });

// Home page component: Shows landing page for guests, app dashboard for logged-in users
function Home() {
	const { isAuthenticated, isLoading } = useStore(authStore);

	if (isLoading) {
		return (
			<div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
				<div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
			</div>
		);
	}

	if (!isAuthenticated) {
		return <LandingPage />;
	}

	return <Dashboard />;
}

// Landing page for guests
function LandingPage() {
	const { signInWithGoogle } = useAuth();

	return (
		<div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
			{/* Hero Section */}
			<div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
				<div className="mb-8">
					<h1 className="text-5xl sm:text-6xl font-bold text-white mb-4">
						<span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
							Shorty Film
						</span>
					</h1>
					<p className="text-xl text-slate-400 max-w-2xl mx-auto">
						Transform your ideas into engaging short-form videos with AI-powered
						storytelling
					</p>
				</div>

				{/* Features */}
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12 max-w-4xl">
					<div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700">
						<Sparkles className="w-10 h-10 text-cyan-400 mb-4 mx-auto" />
						<h3 className="text-lg font-semibold text-white mb-2">AI Story</h3>
						<p className="text-sm text-slate-400">
							Generate complete video stories from your script
						</p>
					</div>
					<div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700">
						<Mic className="w-10 h-10 text-amber-400 mb-4 mx-auto" />
						<h3 className="text-lg font-semibold text-white mb-2">
							Podcast 42
						</h3>
						<p className="text-sm text-slate-400">
							Create talking-head podcast videos easily
						</p>
					</div>
					<div className="p-6 bg-slate-800/50 rounded-xl border border-slate-700">
						<Zap className="w-10 h-10 text-purple-400 mb-4 mx-auto" />
						<h3 className="text-lg font-semibold text-white mb-2">Fast</h3>
						<p className="text-sm text-slate-400">
							Generate professional videos in minutes
						</p>
					</div>
				</div>

				{/* CTA */}
				<button
					type="button"
					onClick={signInWithGoogle}
					className="group inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white text-xl font-bold rounded-xl transition-all duration-300 shadow-2xl shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:scale-105"
				>
					<Play className="w-6 h-6" />
					Get Started with Google
				</button>
				<p className="text-sm text-slate-500 mt-4">
					Free to start. No credit card required.
				</p>
			</div>
		</div>
	);
}

// Dashboard for logged-in users
function Dashboard() {
	return (
		<div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center gap-8 p-6">
			<h2 className="text-2xl font-semibold text-white mb-4">
				What would you like to create?
			</h2>
			<div className="flex flex-col sm:flex-row gap-6">
				<Link
					to="/aistory"
					className="group inline-flex items-center gap-3 px-12 py-6 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white text-2xl font-bold rounded-2xl transition-all duration-300 shadow-2xl shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:scale-105"
				>
					<Sparkles className="w-8 h-8 group-hover:animate-pulse" />
					AI Story
				</Link>
				<Link
					to="/podcast42"
					className="group inline-flex items-center gap-3 px-12 py-6 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-2xl font-bold rounded-2xl transition-all duration-300 shadow-2xl shadow-amber-500/30 hover:shadow-amber-500/50 hover:scale-105"
				>
					<Mic className="w-8 h-8 group-hover:animate-pulse" />
					Podcast 42
				</Link>
			</div>
		</div>
	);
}
