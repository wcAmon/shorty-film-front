import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { ArrowRight, Film, Loader2 } from "lucide-react";
import { useId } from "react";
import { useGeneratePrompts } from "@/hooks/use-aistory-api";
import {
	aistoryActions,
	aistoryStore,
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
			description: "Google Veo 3.1 via FAL AI, high quality with audio generation",
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
	const voiceId = useStore(aistoryStore, (state) => state.voiceId);
	const error = useStore(aistoryStore, (state) => state.error);

	// Generate unique ID for form elements
	const scriptTextareaId = useId();

	// Handle prompts generation (character prompt + scenes)
	const handleGeneratePrompts = () => {
		if (!script.trim()) return;

		aistoryActions.setIsGeneratingPrompts(true);
		aistoryActions.setError(null);
		aistoryActions.resetPrompts();

		generatePromptsMutation.mutate(
			{ script, imageStyle, imageEngine, llmEngine },
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
			<div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
				<label
					htmlFor={scriptTextareaId}
					className="block text-xl font-semibold text-white mb-4"
				>
					Your Story Script
				</label>
				<textarea
					id={scriptTextareaId}
					value={script}
					onChange={(e) => aistoryActions.setScript(e.target.value)}
					placeholder="Describe your story here... Include details about the time period, setting, character appearance, personality, and the narrative flow."
					className="w-full h-48 px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors resize-none"
					disabled={isGeneratingPrompts || promptsGenerated}
				/>
			</div>

			{/* Image Style Selection */}
			<div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
				<h2 className="text-xl font-semibold text-white mb-4">Image Style</h2>
				<div className="space-y-3">
					{IMAGE_STYLES.map((style) => (
						<label
							key={style.id}
							className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
								imageStyle === style.id
									? "border-amber-500 bg-amber-500/10"
									: "border-slate-600 hover:border-slate-500"
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
								<div className="text-white font-medium">{style.label}</div>
								<div className="text-sm text-slate-400">
									{style.description}
								</div>
							</div>
						</label>
					))}
				</div>
			</div>

			{/* Image Engine Selection */}
			<div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
				<h2 className="text-xl font-semibold text-white mb-4">
					Image Generation Engine
				</h2>
				<div className="space-y-3">
					{IMAGE_ENGINES.map((engine) => (
						<label
							key={engine.id}
							className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
								imageEngine === engine.id
									? "border-cyan-500 bg-cyan-500/10"
									: "border-slate-600 hover:border-slate-500"
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
								<div className="text-white font-medium">{engine.label}</div>
								<div className="text-sm text-slate-400">
									{engine.description}
								</div>
							</div>
						</label>
					))}
				</div>
			</div>

			{/* Video Engine Selection */}
			<div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
				<h2 className="text-xl font-semibold text-white mb-4">
					Video Generation Engine
				</h2>
				<div className="space-y-3">
					{VIDEO_ENGINES.map((engine) => (
						<label
							key={engine.id}
							className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
								videoEngine === engine.id
									? "border-purple-500 bg-purple-500/10"
									: "border-slate-600 hover:border-slate-500"
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
								<div className="text-white font-medium">{engine.label}</div>
								<div className="text-sm text-slate-400">
									{engine.description}
								</div>
							</div>
						</label>
					))}
				</div>
			</div>

			{/* Voice Selection */}
			<div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
				<h2 className="text-xl font-semibold text-white mb-4">
					Narration Voice
				</h2>
				<div className="space-y-3">
					{VOICE_OPTIONS.map((voice) => (
						<label
							key={voice.id}
							className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
								voiceId === voice.id
									? "border-emerald-500 bg-emerald-500/10"
									: "border-slate-600 hover:border-slate-500"
							} ${promptsGenerated ? "opacity-50 pointer-events-none" : ""}`}
						>
							<input
								type="radio"
								name="voiceId"
								value={voice.id}
								checked={voiceId === voice.id}
								onChange={() => aistoryActions.setVoiceId(voice.id)}
								className="mt-1 accent-emerald-500"
								disabled={promptsGenerated}
							/>
							<div>
								<div className="text-white font-medium">{voice.label}</div>
								<div className="text-sm text-slate-400">
									{voice.description}
								</div>
							</div>
						</label>
					))}
				</div>
			</div>

			{/* LLM Engine Selection */}
			<div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
				<h2 className="text-xl font-semibold text-white mb-4">
					LLM Engine (for Prompts Generation)
				</h2>
				<div className="space-y-3">
					{LLM_ENGINES.map((engine) => (
						<label
							key={engine.id}
							className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
								llmEngine === engine.id
									? "border-indigo-500 bg-indigo-500/10"
									: "border-slate-600 hover:border-slate-500"
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
								<div className="text-white font-medium">{engine.label}</div>
								<div className="text-sm text-slate-400">
									{engine.description}
								</div>
							</div>
						</label>
					))}
				</div>
			</div>

			{/* Error Display */}
			{error && (
				<div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300">
					{error}
				</div>
			)}

			{/* Action Buttons */}
			<div className="flex gap-4">
				{!promptsGenerated ? (
					<button
						type="button"
						onClick={handleGeneratePrompts}
						disabled={!script.trim() || isGeneratingPrompts}
						className="flex-1 py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 disabled:shadow-none flex items-center justify-center gap-3"
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
					</button>
				) : (
					<button
						type="button"
						onClick={handleContinueToScenes}
						className="flex-1 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 flex items-center justify-center gap-3"
					>
						Continue to Scenes
						<ArrowRight className="w-6 h-6" />
					</button>
				)}
			</div>
		</div>
	);
}
