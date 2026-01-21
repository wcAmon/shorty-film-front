import { createFileRoute, Link } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { Clapperboard, Mic, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { authStore } from "@/stores/auth.store";

export const Route = createFileRoute("/")({ component: Home });

// Home page component: Shows landing page for guests, app dashboard for logged-in users
function Home() {
	const { isAuthenticated, isLoading } = useStore(authStore);

	if (isLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
		<div className="min-h-screen bg-background">
			{/* Hero Section */}
			<div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
				<div className="mb-8">
					<h1 className="mb-4 text-5xl font-bold sm:text-6xl">
						<span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
							Shorty Film
						</span>
					</h1>
					<p className="mx-auto max-w-2xl text-xl text-muted-foreground">
						Transform your ideas into engaging short-form videos with AI-powered
						storytelling
					</p>
				</div>

				{/* Features */}
				<div className="mb-12 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3">
					<Card className="border-border bg-card/50 backdrop-blur">
						<CardContent className="p-6 text-center">
							<Sparkles className="mx-auto mb-4 h-10 w-10 text-cyan-500" />
							<h3 className="mb-2 text-lg font-semibold text-foreground">
								AI Story
							</h3>
							<p className="text-sm text-muted-foreground">
								Generate complete video stories from your script
							</p>
						</CardContent>
					</Card>
					<Card className="border-border bg-card/50 backdrop-blur">
						<CardContent className="p-6 text-center">
							<Mic className="mx-auto mb-4 h-10 w-10 text-amber-500" />
							<h3 className="mb-2 text-lg font-semibold text-foreground">
								Podcast 42
							</h3>
							<p className="text-sm text-muted-foreground">
								Create talking-head podcast videos easily
							</p>
						</CardContent>
					</Card>
					<Card className="border-border bg-card/50 backdrop-blur">
						<CardContent className="p-6 text-center">
							<Clapperboard className="mx-auto mb-4 h-10 w-10 text-purple-500" />
							<h3 className="mb-2 text-lg font-semibold text-foreground">
								Director Mode
							</h3>
							<p className="text-sm text-muted-foreground">
								16:9 landscape with per-scene engine control
							</p>
						</CardContent>
					</Card>
				</div>

				{/* CTA */}
				<Button
					onClick={signInWithGoogle}
					size="lg"
					className="group gap-3 bg-gradient-to-r from-cyan-500 to-blue-500 px-8 py-6 text-xl font-bold shadow-2xl shadow-cyan-500/30 transition-all duration-300 hover:from-cyan-400 hover:to-blue-400 hover:shadow-cyan-500/50"
				>
					<Play className="h-6 w-6" />
					Get Started with Google
				</Button>
				<p className="mt-4 text-sm text-muted-foreground">
					Free to start. No credit card required.
				</p>
			</div>
		</div>
	);
}

// Dashboard for logged-in users
function Dashboard() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-6">
			<h2 className="mb-4 text-2xl font-semibold text-foreground">
				What would you like to create?
			</h2>
			<div className="flex flex-col gap-6 sm:flex-row">
				<Link
					to="/aistory"
					className="group inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 px-12 py-6 text-2xl font-bold text-white shadow-2xl shadow-cyan-500/30 transition-all duration-300 hover:scale-105 hover:from-cyan-400 hover:to-blue-400 hover:shadow-cyan-500/50"
				>
					<Sparkles className="h-8 w-8 group-hover:animate-pulse" />
					AI Story
				</Link>
				<Link
					to="/podcast42"
					className="group inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-12 py-6 text-2xl font-bold text-white shadow-2xl shadow-amber-500/30 transition-all duration-300 hover:scale-105 hover:from-amber-400 hover:to-orange-400 hover:shadow-amber-500/50"
				>
					<Mic className="h-8 w-8 group-hover:animate-pulse" />
					Podcast 42
				</Link>
				<Link
					to="/director-mode"
					className="group inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-purple-500 to-pink-500 px-12 py-6 text-2xl font-bold text-white shadow-2xl shadow-purple-500/30 transition-all duration-300 hover:scale-105 hover:from-purple-400 hover:to-pink-400 hover:shadow-purple-500/50"
				>
					<Clapperboard className="h-8 w-8 group-hover:animate-pulse" />
					Director Mode
				</Link>
			</div>
		</div>
	);
}
