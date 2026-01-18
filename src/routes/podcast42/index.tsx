import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { ArrowRight, Loader2, Mic } from "lucide-react";
import { useId } from "react";
import { useGeneratePodcast42Prompts } from "@/hooks/use-podcast42-api";
import type { ImageEngine, ImageStyle, LLMEngine, VoiceId } from "@/stores/aistory.store";
import { podcast42Actions, podcast42Store } from "@/stores/podcast42.store";

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

// Voice options for person selections
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

// Placeholder for play script format
const PLAY_SCRIPT_PLACEHOLDER = `---
background: A cozy podcast studio with warm lighting and vintage microphones
person1: A young tech entrepreneur in his 30s, casual hoodie, modern glasses
person2: A seasoned journalist in her 50s, professional blazer, silver hair
---
[person1]: Welcome to the show! Today we're discussing the future of AI.
[person2]: Thanks for having me. I've been following this space for decades.
[person1]: What surprises you most about recent developments?
[person2]: The speed of change. What used to take years now happens in months.`;

export const Route = createFileRoute("/podcast42/")({
	component: Podcast42InputPage,
});

function Podcast42InputPage() {
	const navigate = useNavigate();

	// React Query mutation
	const generatePromptsMutation = useGeneratePodcast42Prompts();

	// Subscribe to store state
	const playScript = useStore(podcast42Store, (state) => state.playScript);
	const promptsGenerated = useStore(
		podcast42Store,
		(state) => state.promptsGenerated,
	);
	const isGeneratingPrompts = useStore(
		podcast42Store,
		(state) => state.isGeneratingPrompts,
	);
	const imageEngine = useStore(podcast42Store, (state) => state.imageEngine);
	const imageStyle = useStore(podcast42Store, (state) => state.imageStyle);
	const person1VoiceId = useStore(
		podcast42Store,
		(state) => state.person1VoiceId,
	);
	const person2VoiceId = useStore(
		podcast42Store,
		(state) => state.person2VoiceId,
	);
	const llmEngine = useStore(podcast42Store, (state) => state.llmEngine);
	const error = useStore(podcast42Store, (state) => state.error);

	// Generate unique ID for form elements
	const scriptTextareaId = useId();

	// Handle prompts generation
	const handleGeneratePrompts = () => {
		if (!playScript.trim()) return;

		podcast42Actions.setIsGeneratingPrompts(true);
		podcast42Actions.setError(null);
		podcast42Actions.resetPrompts();

		generatePromptsMutation.mutate(
			{ playScript, imageStyle, llmEngine },
			{
				onSuccess: (result) => {
					if (
						result.success &&
						result.storyId &&
						result.person1Prompt &&
						result.person2Prompt &&
						result.scenes
					) {
						podcast42Actions.setStoryId(result.storyId);
						podcast42Actions.setPerson1Prompt(result.person1Prompt);
						podcast42Actions.setPerson2Prompt(result.person2Prompt);
						podcast42Actions.setScenes(
							result.scenes.map(
								(
									scene: { speaker: string; caption: string },
									index: number,
								) => ({
									id: `scene-${index}`,
									speaker: scene.speaker as "person1" | "person2",
									caption: scene.caption,
								}),
							),
						);
						podcast42Actions.setPromptsGenerated(true);
					} else {
						podcast42Actions.setError(
							result.error || "Failed to generate prompts",
						);
					}
					podcast42Actions.setIsGeneratingPrompts(false);
				},
				onError: (err) => {
					podcast42Actions.setError(
						err instanceof Error ? err.message : "An unexpected error occurred",
					);
					podcast42Actions.setIsGeneratingPrompts(false);
				},
			},
		);
	};

	// Navigate to scenes page
	const handleContinueToScenes = () => {
		navigate({ to: "/podcast42/scenes" });
	};

	return (
		<div className="space-y-8">
			{/* Play Script Input Section */}
			<div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
				<label
					htmlFor={scriptTextareaId}
					className="block text-xl font-semibold text-white mb-4"
				>
					Play Script
				</label>
				<textarea
					id={scriptTextareaId}
					value={playScript}
					onChange={(e) => podcast42Actions.setPlayScript(e.target.value)}
					placeholder={PLAY_SCRIPT_PLACEHOLDER}
					className="w-full h-64 px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors resize-none font-mono text-sm"
					disabled={isGeneratingPrompts || promptsGenerated}
				/>
				<p className="mt-2 text-sm text-slate-400">
					Define background, person1/person2 descriptions, then dialogue with
					[person1]/[person2] tags
				</p>
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
								onChange={() => podcast42Actions.setImageStyle(style.id)}
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
								onChange={() => podcast42Actions.setImageEngine(engine.id)}
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

			{/* Video Engine Info (Fixed) */}
			<div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
				<h2 className="text-xl font-semibold text-white mb-4">
					Video Generation Engine
				</h2>
				<div className="p-4 rounded-lg border border-purple-500 bg-purple-500/10">
					<div className="text-white font-medium">OmniHuman v1.5</div>
					<div className="text-sm text-slate-400">
						Talking-head video generation from image + audio (fixed engine for
						podcast)
					</div>
				</div>
			</div>

			{/* Person 1 Voice Selection */}
			<div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
				<h2 className="text-xl font-semibold text-white mb-4">
					Person 1 Voice
				</h2>
				<div className="space-y-3">
					{VOICE_OPTIONS.map((voice) => (
						<label
							key={voice.id}
							className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
								person1VoiceId === voice.id
									? "border-emerald-500 bg-emerald-500/10"
									: "border-slate-600 hover:border-slate-500"
							} ${promptsGenerated ? "opacity-50 pointer-events-none" : ""}`}
						>
							<input
								type="radio"
								name="person1VoiceId"
								value={voice.id}
								checked={person1VoiceId === voice.id}
								onChange={() => podcast42Actions.setPerson1VoiceId(voice.id)}
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

			{/* Person 2 Voice Selection */}
			<div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
				<h2 className="text-xl font-semibold text-white mb-4">
					Person 2 Voice
				</h2>
				<div className="space-y-3">
					{VOICE_OPTIONS.map((voice) => (
						<label
							key={voice.id}
							className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
								person2VoiceId === voice.id
									? "border-rose-500 bg-rose-500/10"
									: "border-slate-600 hover:border-slate-500"
							} ${promptsGenerated ? "opacity-50 pointer-events-none" : ""}`}
						>
							<input
								type="radio"
								name="person2VoiceId"
								value={voice.id}
								checked={person2VoiceId === voice.id}
								onChange={() => podcast42Actions.setPerson2VoiceId(voice.id)}
								className="mt-1 accent-rose-500"
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
								onChange={() => podcast42Actions.setLLMEngine(engine.id)}
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
						disabled={!playScript.trim() || isGeneratingPrompts}
						className="flex-1 py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 disabled:shadow-none flex items-center justify-center gap-3"
					>
						{isGeneratingPrompts ? (
							<>
								<Loader2 className="w-6 h-6 animate-spin" />
								Generating Prompts...
							</>
						) : (
							<>
								<Mic className="w-6 h-6" />
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
