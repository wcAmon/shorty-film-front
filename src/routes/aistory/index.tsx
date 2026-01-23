import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { ArrowRight, Film, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { ErrorWithRetry } from "@/components/error-with-retry";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGeneratePrompts } from "@/hooks/use-aistory-api";
import {
	aistoryActions,
	aistoryStore,
	type CaptionLanguage,
	type ImageEngine,
	type ImageStyle,
	type LLMEngine,
	type VideoEngine,
	type VoiceId,
} from "@/stores/aistory.store";

// Image style options for selection
const IMAGE_STYLES: { id: ImageStyle; label: string; description: string }[] = [
	{
		id: "cinematic",
		label: "Cinematic",
		description: "Realistic film still look with natural lighting",
	},
	{
		id: "comic",
		label: "Comic",
		description: "1950s American comic style (pulp print)",
	},
	{
		id: "low-poly",
		label: "Low-Poly",
		description: "Oil-paint diorama with low-poly statues",
	},
	{
		id: "japanese-anime",
		label: "Japanese Anime",
		description: "Classic 90s hand-drawn anime/manga look (cel animation)",
	},
	{
		id: "clay",
		label: "Clay",
		description: "Claymation style with handcrafted miniature diorama feel",
	},
];

// Image engine options for selection
const IMAGE_ENGINES: { id: ImageEngine; label: string; description: string }[] =
	[
		{
			id: "flux-pro",
			label: "Flux Pro",
			description: "Fast, high quality images (recommended)",
		},
		{
			id: "gpt-image-1.5",
			label: "GPT Image 1.5",
			description: "OpenAI GPT-Image via FAL AI, with character consistency",
		},
		{
			id: "nano-banana-pro",
			label: "Nano Banana Pro",
			description:
				"Fast character-consistent generation with reference support",
		},
		{
			id: "nano-banana",
			label: "Nano Banana",
			description: "Lightweight, fast generation with character reference",
		},
	];

// Voice options for narration
const VOICE_OPTIONS: { id: VoiceId; label: string; description: string }[] = [
	{
		id: "PIGsltMj3gFMR34aFDI3",
		label: "Jonathan",
		description: "Male, warm and engaging storyteller voice",
	},
	{
		id: "Z3R5wn05IrDiVCyEkUrK",
		label: "Arabella",
		description: "Female, elegant and expressive narration",
	},
	{
		id: "n1PvBOwxb8X6m7tahp2h",
		label: "Michael",
		description: "Male, deep and authoritative voice",
	},
	{
		id: "ZF6FPAbjXT4488VcRRnw",
		label: "Amelia",
		description: "Female, friendly and natural conversational tone",
	},
	{
		id: "ICwKbPHDHAM3eal5tHEZ",
		label: "Tony",
		description: "Male, New York accent with street-smart vibe",
	},
	{
		id: "cgLpYGyXZhkyalKZ0xeZ",
		label: "Knox",
		description: "Male, hype-man sincere voice",
	},
	{
		id: "YKrm0N1EAM9Bw27j8kuD",
		label: "Leonidas",
		description: "Male, legendary Spartan warrior voice",
	},
];

// Video engine options for selection
const VIDEO_ENGINES: { id: VideoEngine; label: string; description: string }[] =
	[
		{
			id: "kling-video",
			label: "Kling v2.6 Pro",
			description:
				"Direct image animation, better quality, generates audio (recommended)",
		},
		{
			id: "kling-video-v2.5-turbo",
			label: "Kling v2.5 Turbo",
			description: "Faster Kling generation with good quality",
		},
		{
			id: "sora-2",
			label: "Sora 2",
			description: "OpenAI Sora 2 via FAL AI, high quality video generation",
		},
		{
			id: "ltx-2-19b",
			label: "LTX-2 19B",
			description: "Fast generation with good motion quality",
		},
		{
			id: "veo3.1",
			label: "Veo 3.1",
			description:
				"Google Veo 3.1 via FAL AI, high quality with audio generation",
		},
		{
			id: "veo3.1-fast",
			label: "Veo 3.1 Fast",
			description: "Faster Veo 3.1 generation, good for testing",
		},
	];

// LLM engine options for prompt generation
const LLM_ENGINES: { id: LLMEngine; label: string; description: string }[] = [
	{
		id: "gpt-4.1",
		label: "GPT-4.1",
		description: "OpenAI GPT-4.1, fast and reliable (recommended)",
	},
	{
		id: "claude-opus-4-5",
		label: "Claude Opus 4.5",
		description: "Anthropic Claude Opus 4.5, excellent at creative writing",
	},
	{
		id: "gemini-2.5-pro",
		label: "Gemini 3 Pro",
		description: "Google Gemini 3 Pro, cost-effective with strong reasoning",
	},
];

// Caption language options
const CAPTION_LANGUAGES: { id: CaptionLanguage; label: string }[] = [
	{ id: "en", label: "English" },
	{ id: "zh-TW", label: "繁體中文" },
];

export const Route = createFileRoute("/aistory/")({
	component: PromptsPage,
});

// Prompts Page: Script input + Video engine selection + Generate prompts
function PromptsPage() {
	const navigate = useNavigate();

	// React Query mutation
	const generatePromptsMutation = useGeneratePrompts();

	// Subscribe to store state
	const script = useStore(aistoryStore, (state) => state.script);
	const promptsGenerated = useStore(
		aistoryStore,
		(state) => state.promptsGenerated,
	);
	const isGeneratingPrompts = useStore(
		aistoryStore,
		(state) => state.isGeneratingPrompts,
	);
	const imageEngine = useStore(aistoryStore, (state) => state.imageEngine);
	const imageStyle = useStore(aistoryStore, (state) => state.imageStyle);
	const videoEngine = useStore(aistoryStore, (state) => state.videoEngine);
	const llmEngine = useStore(aistoryStore, (state) => state.llmEngine);
	const captionLanguage = useStore(
		aistoryStore,
		(state) => state.captionLanguage,
	);
	const error = useStore(aistoryStore, (state) => state.error);

	// Local state for default voice selection (used when generating prompts)
	// This voiceId will be applied to all scenes as their initial voice
	const [defaultVoiceId, setDefaultVoiceId] = useState<VoiceId>(
		"PIGsltMj3gFMR34aFDI3",
	); // Default: Jonathan

	// Generate unique ID for form elements
	const scriptTextareaId = useId();

	// Handle prompts generation (character prompt + scenes)
	const handleGeneratePrompts = () => {
		if (!script.trim()) return;

		aistoryActions.setIsGeneratingPrompts(true);
		aistoryActions.setError(null);
		aistoryActions.resetPrompts();

		generatePromptsMutation.mutate(
			{
				script,
				imageStyle,
				imageEngine,
				llmEngine,
				voiceId: defaultVoiceId,
				videoEngine,
				captionLanguage,
			},
			{
				onSuccess: (result) => {
					if (
						result.success &&
						result.storyId &&
						result.characterPrompt &&
						result.scenes
					) {
						aistoryActions.setStoryId(result.storyId);
						aistoryActions.setCharacterPrompt(result.characterPrompt);
						aistoryActions.setScenes(result.scenes);
						aistoryActions.setPromptsGenerated(true);
					} else {
						aistoryActions.setError(
							result.error || "Failed to generate prompts",
						);
					}
					aistoryActions.setIsGeneratingPrompts(false);
				},
				onError: (err) => {
					aistoryActions.setError(
						err instanceof Error ? err.message : "An unexpected error occurred",
					);
					aistoryActions.setIsGeneratingPrompts(false);
				},
			},
		);
	};

	// Navigate to scenes page
	const handleContinueToScenes = () => {
		navigate({ to: "/aistory/scenes" });
	};

	return (
		<div className="space-y-8">
			{/* Script Input Section */}
			<Card className="rounded-2xl">
				<CardContent>
					<label
						htmlFor={scriptTextareaId}
						className="block text-xl font-semibold text-foreground mb-4"
					>
						Your Story Script
					</label>
					<textarea
						id={scriptTextareaId}
						value={script}
						onChange={(e) => aistoryActions.setScript(e.target.value)}
						placeholder="Describe your story here... Include details about the time period, setting, character appearance, personality, and the narrative flow."
						className="w-full h-48 px-4 py-3 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors resize-none"
						disabled={isGeneratingPrompts || promptsGenerated}
					/>
				</CardContent>
			</Card>

			{/* Image Style Selection */}
			<Card className="rounded-2xl">
				<CardContent>
					<h2 className="text-xl font-semibold text-foreground mb-4">
						Image Style
					</h2>
					<div className="space-y-3">
						{IMAGE_STYLES.map((style) => (
							<label
								key={style.id}
								className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
									imageStyle === style.id
										? "border-amber-500 bg-amber-500/10"
										: "border-border hover:border-muted-foreground"
								} ${promptsGenerated ? "opacity-50 pointer-events-none" : ""}`}
							>
								<input
									type="radio"
									name="imageStyle"
									value={style.id}
									checked={imageStyle === style.id}
									onChange={() => aistoryActions.setImageStyle(style.id)}
									className="mt-1 accent-amber-500"
									disabled={promptsGenerated}
								/>
								<div>
									<div className="text-foreground font-medium">
										{style.label}
									</div>
									<div className="text-sm text-muted-foreground">
										{style.description}
									</div>
								</div>
							</label>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Image Engine Selection */}
			<Card className="rounded-2xl">
				<CardContent>
					<h2 className="text-xl font-semibold text-foreground mb-4">
						Image Generation Engine
					</h2>
					<div className="space-y-3">
						{IMAGE_ENGINES.map((engine) => (
							<label
								key={engine.id}
								className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
									imageEngine === engine.id
										? "border-cyan-500 bg-cyan-500/10"
										: "border-border hover:border-muted-foreground"
								} ${promptsGenerated ? "opacity-50 pointer-events-none" : ""}`}
							>
								<input
									type="radio"
									name="imageEngine"
									value={engine.id}
									checked={imageEngine === engine.id}
									onChange={() => aistoryActions.setImageEngine(engine.id)}
									className="mt-1 accent-cyan-500"
									disabled={promptsGenerated}
								/>
								<div>
									<div className="text-foreground font-medium">
										{engine.label}
									</div>
									<div className="text-sm text-muted-foreground">
										{engine.description}
									</div>
								</div>
							</label>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Video Engine Selection */}
			<Card className="rounded-2xl">
				<CardContent>
					<h2 className="text-xl font-semibold text-foreground mb-4">
						Video Generation Engine
					</h2>
					<div className="space-y-3">
						{VIDEO_ENGINES.map((engine) => (
							<label
								key={engine.id}
								className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
									videoEngine === engine.id
										? "border-purple-500 bg-purple-500/10"
										: "border-border hover:border-muted-foreground"
								} ${promptsGenerated ? "opacity-50 pointer-events-none" : ""}`}
							>
								<input
									type="radio"
									name="videoEngine"
									value={engine.id}
									checked={videoEngine === engine.id}
									onChange={() => aistoryActions.setVideoEngine(engine.id)}
									className="mt-1 accent-purple-500"
									disabled={promptsGenerated}
								/>
								<div>
									<div className="text-foreground font-medium">
										{engine.label}
									</div>
									<div className="text-sm text-muted-foreground">
										{engine.description}
									</div>
								</div>
							</label>
						))}
					</div>
				</CardContent>
			</Card>

			{/* Voice Selection */}
			<Card className="rounded-2xl">
				<CardContent>
					<h2 className="text-xl font-semibold text-foreground mb-4">
						Default Narration Voice
					</h2>
					<p className="text-sm text-muted-foreground mb-4">
						This voice will be applied to all scenes. You can change voice per
						scene in the editor.
					</p>
					<div className="space-y-3">
						{VOICE_OPTIONS.map((voice) => (
							<label
								key={voice.id}
								className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
									defaultVoiceId === voice.id
										? "border-emerald-500 bg-emerald-500/10"
										: "border-border hover:border-muted-foreground"
								} ${promptsGenerated ? "opacity-50 pointer-events-none" : ""}`}
							>
								<input
									type="radio"
									name="voiceId"
									value={voice.id}
									checked={defaultVoiceId === voice.id}
									onChange={() => setDefaultVoiceId(voice.id)}
									className="mt-1 accent-emerald-500"
									disabled={promptsGenerated}
								/>
								<div>
									<div className="text-foreground font-medium">
										{voice.label}
									</div>
									<div className="text-sm text-muted-foreground">
										{voice.description}
									</div>
								</div>
							</label>
						))}
					</div>
				</CardContent>
			</Card>

			{/* LLM Engine Selection */}
			<Card className="rounded-2xl">
				<CardContent>
					<h2 className="text-xl font-semibold text-foreground mb-4">
						LLM Engine (for Prompts Generation)
					</h2>
					<div className="space-y-3">
						{LLM_ENGINES.map((engine) => (
							<label
								key={engine.id}
								className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
									llmEngine === engine.id
										? "border-indigo-500 bg-indigo-500/10"
										: "border-border hover:border-muted-foreground"
								} ${promptsGenerated ? "opacity-50 pointer-events-none" : ""}`}
							>
								<input
									type="radio"
									name="llmEngine"
									value={engine.id}
									checked={llmEngine === engine.id}
									onChange={() => aistoryActions.setLLMEngine(engine.id)}
									className="mt-1 accent-indigo-500"
									disabled={promptsGenerated}
								/>
								<div>
									<div className="text-foreground font-medium">
										{engine.label}
									</div>
									<div className="text-sm text-muted-foreground">
										{engine.description}
									</div>
								</div>
							</label>
						))}
					</div>

					{/* Caption Language Selection - Segmented Button */}
					<div className="mt-6 pt-6 border-t border-border">
						<h3 className="text-sm font-medium text-muted-foreground mb-3">
							Caption Language
						</h3>
						<div
							className={`inline-flex rounded-lg bg-muted p-1 ${promptsGenerated ? "opacity-50 pointer-events-none" : ""}`}
						>
							{CAPTION_LANGUAGES.map((lang) => (
								<Button
									key={lang.id}
									type="button"
									variant={captionLanguage === lang.id ? "default" : "ghost"}
									size="sm"
									onClick={() => aistoryActions.setCaptionLanguage(lang.id)}
									disabled={promptsGenerated}
									className={
										captionLanguage === lang.id
											? "bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}
								>
									{lang.label}
								</Button>
							))}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Error Display with retry */}
			{error && (
				<ErrorWithRetry
					error={error.message}
					onRetry={handleGeneratePrompts}
					onDismiss={() => aistoryActions.setError(null)}
					isRetrying={isGeneratingPrompts}
				/>
			)}

			{/* Action Buttons */}
			<div className="flex gap-4">
				{!promptsGenerated ? (
					<Button
						type="button"
						onClick={handleGeneratePrompts}
						disabled={!script.trim() || isGeneratingPrompts}
						size="lg"
						className="flex-1 py-6 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-muted disabled:to-muted disabled:cursor-not-allowed text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 disabled:shadow-none"
					>
						{isGeneratingPrompts ? (
							<>
								<Loader2 className="w-6 h-6 animate-spin" />
								Generating Prompts...
							</>
						) : (
							<>
								<Film className="w-6 h-6" />
								GENERATE PROMPTS
							</>
						)}
					</Button>
				) : (
					<Button
						type="button"
						onClick={handleContinueToScenes}
						size="lg"
						className="flex-1 py-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50"
					>
						Continue to Scenes
						<ArrowRight className="w-6 h-6" />
					</Button>
				)}
			</div>
		</div>
	);
}
