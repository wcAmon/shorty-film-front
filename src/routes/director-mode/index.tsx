import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { ChevronDown, ChevronUp, Loader2, Settings, ArrowRight, Clapperboard } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCreateDirectorStory } from "@/hooks/use-director-api";
import {
	directorActions,
	directorStore,
	type DirectorAvatarEngine,
	type DirectorCaptionLanguage,
	type DirectorImageEngine,
	type DirectorImageStyle,
	type DirectorVideoEngine,
} from "@/stores/director.store";

// ============================================================================
// Options
// ============================================================================

const IMAGE_STYLES: { id: DirectorImageStyle; label: string; description: string }[] = [
	{ id: "cinematic", label: "Cinematic", description: "Realistic film still look with natural lighting" },
	{ id: "comic", label: "Comic", description: "1950s American comic style (pulp print)" },
	{ id: "low-poly", label: "Low-Poly", description: "Oil-paint diorama with low-poly statues" },
	{ id: "japanese-anime", label: "Japanese Anime", description: "Classic 90s hand-drawn anime/manga look" },
	{ id: "clay", label: "Clay", description: "Claymation style with handcrafted miniature diorama feel" },
];

const IMAGE_ENGINES: { id: DirectorImageEngine; label: string; description?: string }[] = [
	{ id: "flux-pro", label: "Flux Pro", description: "Fast, high quality images (recommended)" },
	{ id: "gpt-image-1.5", label: "GPT Image 1.5", description: "OpenAI GPT-Image via FAL AI, with character consistency" },
	{ id: "nano-banana-pro", label: "Nano Banana Pro", description: "Fast character-consistent generation with reference support" },
];

const VIDEO_ENGINES: { id: DirectorVideoEngine; label: string; description?: string }[] = [
	{ id: "kling-video", label: "Kling v2.6 Pro", description: "Direct image animation, better quality (recommended)" },
	{ id: "sora-2", label: "Sora 2", description: "OpenAI Sora 2 via FAL AI, high quality video generation" },
	{ id: "ltx-2-19b", label: "LTX-2 19B", description: "Fast generation with good motion quality" },
	{ id: "veo3.1", label: "Veo 3.1", description: "Google Veo 3.1 via FAL AI, high quality with audio generation" },
	{ id: "veo3.1-fast", label: "Veo 3.1 Fast", description: "Faster Veo 3.1 generation, good for testing" },
];

const AVATAR_ENGINES: { id: DirectorAvatarEngine; label: string; description?: string }[] = [
	{ id: "omnihuman", label: "Omnihuman", description: "High quality talking head generation (recommended)" },
	{ id: "aurora", label: "Aurora", description: "Fast avatar video generation" },
];

const VOICE_OPTIONS: { id: string; label: string; description?: string }[] = [
	{ id: "PIGsltMj3gFMR34aFDI3", label: "Jonathan", description: "Male, warm and engaging storyteller voice" },
	{ id: "Z3R5wn05IrDiVCyEkUrK", label: "Arabella", description: "Female, elegant and expressive narration" },
	{ id: "n1PvBOwxb8X6m7tahp2h", label: "Michael", description: "Male, deep and authoritative voice" },
	{ id: "ZF6FPAbjXT4488VcRRnw", label: "Amelia", description: "Female, friendly and natural conversational tone" },
	{ id: "ICwKbPHDHAM3eal5tHEZ", label: "Tony", description: "Male, New York accent with street-smart vibe" },
	{ id: "cgLpYGyXZhkyalKZ0xeZ", label: "Knox", description: "Male, hype-man sincere voice" },
	{ id: "YKrm0N1EAM9Bw27j8kuD", label: "Leonidas", description: "Male, legendary Spartan warrior voice" },
];

const CAPTION_LANGUAGES: { id: DirectorCaptionLanguage; label: string }[] = [
	{ id: "en", label: "English" },
	{ id: "zh-TW", label: "繁體中文" },
];

// ============================================================================
// Route
// ============================================================================

export const Route = createFileRoute("/director-mode/")({
	component: DirectorModeSetupPage,
});

// ============================================================================
// Main Component - Setup Page
// ============================================================================

function DirectorModeSetupPage() {
	const navigate = useNavigate();

	// React Query mutations
	const createStoryMutation = useCreateDirectorStory();

	// Subscribe to store state
	const title = useStore(directorStore, (s) => s.title);
	const defaultImageEngine = useStore(directorStore, (s) => s.defaultImageEngine);
	const defaultImageStyle = useStore(directorStore, (s) => s.defaultImageStyle);
	const defaultVideoEngine = useStore(directorStore, (s) => s.defaultVideoEngine);
	const defaultAvatarEngine = useStore(directorStore, (s) => s.defaultAvatarEngine);
	const defaultVoiceId = useStore(directorStore, (s) => s.defaultVoiceId);
	const defaultVoiceSpeed = useStore(directorStore, (s) => s.defaultVoiceSpeed);
	const captionLanguage = useStore(directorStore, (s) => s.captionLanguage);

	// Local state
	const [isSettingsExpanded, setIsSettingsExpanded] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Handle continue to scenes - creates story and navigates
	const handleContinueToScenes = async () => {
		if (!title.trim()) return;

		setError(null);

		try {
			const result = await createStoryMutation.mutateAsync({
				title: title.trim(),
				imageEngine: defaultImageEngine,
				imageStyle: defaultImageStyle,
				voiceId: defaultVoiceId,
				videoEngine: defaultVideoEngine,
			});

			if (result.success && result.storyId) {
				directorActions.setStoryId(result.storyId);
				console.log(`[director-mode] Created new story: ${result.storyId}`);
				navigate({ to: "/director-mode/scenes" });
			} else {
				setError(result.error || "Failed to create story");
			}
		} catch (err) {
			console.error("[director-mode] Error creating story:", err);
			setError(err instanceof Error ? err.message : "Failed to create story");
		}
	};

	return (
		<div className="mx-auto max-w-3xl space-y-8 py-8">
			{/* Header */}
			<div className="text-center">
				<Clapperboard className="w-16 h-16 mx-auto mb-4 text-purple-400" />
				<h1 className="text-3xl font-bold text-foreground mb-2">Director Mode</h1>
				<p className="text-muted-foreground">Create your story scene by scene with full creative control</p>
			</div>

			{/* Story Title */}
			<Card>
				<CardContent className="p-6">
					<label className="block text-sm font-medium text-muted-foreground mb-2">Story Title *</label>
					<textarea
						value={title}
						onChange={(e) => directorActions.setTitle(e.target.value)}
						placeholder="Enter your story title..."
						className="w-full px-4 py-3 bg-background border border-border rounded-lg text-xl font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-purple-500 resize-none"
						rows={2}
					/>
					{!title.trim() && (
						<p className="mt-2 text-sm text-amber-400">Please enter a title to continue</p>
					)}
				</CardContent>
			</Card>

			{/* Default Engine Settings */}
			<Card>
				<CardContent className="p-6">
					<button
						type="button"
						onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
						className="w-full flex items-center justify-between text-sm font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
					>
						<span className="flex items-center gap-2">
							<Settings className="w-4 h-4" />
							Default Settings
						</span>
						{isSettingsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
					</button>

					{/* Summary tags */}
					<div className="flex flex-wrap gap-2 mt-3">
						<div className="px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/30 rounded-lg">
							<span className="text-xs text-cyan-400 font-medium">Image: {IMAGE_ENGINES.find((e) => e.id === defaultImageEngine)?.label}</span>
						</div>
						<div className="px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-lg">
							<span className="text-xs text-amber-400 font-medium">Style: {defaultImageStyle.charAt(0).toUpperCase() + defaultImageStyle.slice(1).replace("-", " ")}</span>
						</div>
						<div className="px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded-lg">
							<span className="text-xs text-purple-400 font-medium">Video: {VIDEO_ENGINES.find((e) => e.id === defaultVideoEngine)?.label}</span>
						</div>
						<div className="px-3 py-1.5 bg-indigo-500/20 border border-indigo-500/30 rounded-lg">
							<span className="text-xs text-indigo-400 font-medium">Avatar: {AVATAR_ENGINES.find((e) => e.id === defaultAvatarEngine)?.label}</span>
						</div>
					</div>

					{/* Expanded settings */}
					{isSettingsExpanded && (
						<div className="mt-4 pt-4 border-t border-border">
							<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
								{/* Image Style */}
								<div>
									<label className="block text-sm font-medium text-muted-foreground mb-2">Image Style</label>
									<select
										value={defaultImageStyle}
										onChange={(e) => directorActions.setDefaultImageStyle(e.target.value as DirectorImageStyle)}
										className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-amber-500"
									>
										{IMAGE_STYLES.map((style) => (
											<option key={style.id} value={style.id}>{style.label}</option>
										))}
									</select>
								</div>

								{/* Image Engine */}
								<div>
									<label className="block text-sm font-medium text-muted-foreground mb-2">Image Engine</label>
									<select
										value={defaultImageEngine}
										onChange={(e) => directorActions.setDefaultImageEngine(e.target.value as DirectorImageEngine)}
										className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-cyan-500"
									>
										{IMAGE_ENGINES.map((engine) => (
											<option key={engine.id} value={engine.id}>{engine.label}</option>
										))}
									</select>
								</div>

								{/* Video Engine */}
								<div>
									<label className="block text-sm font-medium text-muted-foreground mb-2">Video Engine</label>
									<select
										value={defaultVideoEngine}
										onChange={(e) => directorActions.setDefaultVideoEngine(e.target.value as DirectorVideoEngine)}
										className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-purple-500"
									>
										{VIDEO_ENGINES.map((engine) => (
											<option key={engine.id} value={engine.id}>{engine.label}</option>
										))}
									</select>
								</div>

								{/* Avatar Engine */}
								<div>
									<label className="block text-sm font-medium text-muted-foreground mb-2">Avatar Engine</label>
									<select
										value={defaultAvatarEngine}
										onChange={(e) => directorActions.setDefaultAvatarEngine(e.target.value as DirectorAvatarEngine)}
										className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-indigo-500"
									>
										{AVATAR_ENGINES.map((engine) => (
											<option key={engine.id} value={engine.id}>{engine.label}</option>
										))}
									</select>
								</div>

								{/* Voice */}
								<div>
									<label className="block text-sm font-medium text-muted-foreground mb-2">Default Voice</label>
									<select
										value={defaultVoiceId}
										onChange={(e) => directorActions.setDefaultVoiceId(e.target.value)}
										className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-emerald-500"
									>
										{VOICE_OPTIONS.map((voice) => (
											<option key={voice.id} value={voice.id}>{voice.label}</option>
										))}
									</select>
								</div>

								{/* Voice Speed */}
								<div>
									<label className="block text-sm font-medium text-muted-foreground mb-2">Voice Speed</label>
									<select
										value={defaultVoiceSpeed}
										onChange={(e) => directorActions.setDefaultVoiceSpeed(Number.parseFloat(e.target.value))}
										className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-emerald-500"
									>
										<option value={0.7}>0.7x</option>
										<option value={0.8}>0.8x</option>
										<option value={0.9}>0.9x</option>
										<option value={1.0}>1.0x</option>
										<option value={1.1}>1.1x</option>
										<option value={1.2}>1.2x</option>
									</select>
								</div>
							</div>

							{/* Caption Language */}
							<div>
								<label className="block text-sm font-medium text-muted-foreground mb-2">Caption Language</label>
								<div className="inline-flex rounded-lg bg-muted p-1">
									{CAPTION_LANGUAGES.map((lang) => (
										<Button
											key={lang.id}
											type="button"
											variant={captionLanguage === lang.id ? "default" : "ghost"}
											size="sm"
											onClick={() => directorActions.setCaptionLanguage(lang.id)}
											className={captionLanguage === lang.id
												? "bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm"
												: "text-muted-foreground hover:text-foreground"}
										>
											{lang.label}
										</Button>
									))}
								</div>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Error Display */}
			{error && (
				<div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-400">
					{error}
				</div>
			)}

			{/* Continue Button */}
			<Button
				onClick={handleContinueToScenes}
				disabled={!title.trim() || createStoryMutation.isPending}
				size="lg"
				className="w-full py-6 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-muted disabled:to-muted text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 disabled:shadow-none"
			>
				{createStoryMutation.isPending ? (
					<>
						<Loader2 className="w-6 h-6 mr-3 animate-spin" />
						Creating Project...
					</>
				) : (
					<>
						Continue to Scenes
						<ArrowRight className="w-6 h-6 ml-3" />
					</>
				)}
			</Button>

			<p className="text-center text-sm text-muted-foreground">
				You can change these settings later in the scene editor
			</p>
		</div>
	);
}
