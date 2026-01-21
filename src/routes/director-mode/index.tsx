import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import {
	ArrowRight,
	ChevronDown,
	FolderOpen,
	ImageIcon,
	Loader2,
	Upload,
	User,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { AssetPickerModal } from "@/components/asset-picker-modal";
import { ErrorWithRetry } from "@/components/error-with-retry";
import {
	useGenerateDirectorCharacter,
	useUploadDirectorCharacter,
} from "@/hooks/use-director-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	directorActions,
	directorStore,
	type DirectorAvatarEngine,
	type DirectorCaptionLanguage,
	type DirectorImageEngine,
	type DirectorImageStyle,
	type DirectorVideoEngine,
	type DirectorVoiceId,
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

const IMAGE_ENGINES: { id: DirectorImageEngine; label: string; description: string }[] = [
	{ id: "flux-pro", label: "Flux Pro", description: "Fast, high quality images (recommended)" },
	{ id: "gpt-image-1.5", label: "GPT Image 1.5", description: "OpenAI GPT-Image via FAL AI, with character consistency" },
	{ id: "nano-banana-pro", label: "Nano Banana Pro", description: "Fast character-consistent generation with reference support" },
];

const VIDEO_ENGINES: { id: DirectorVideoEngine; label: string; description: string }[] = [
	{ id: "kling-video", label: "Kling v2.6 Pro", description: "Direct image animation, better quality (recommended)" },
	{ id: "sora-2", label: "Sora 2", description: "OpenAI Sora 2 via FAL AI, high quality video generation" },
	{ id: "ltx-2-19b", label: "LTX-2 19B", description: "Fast generation with good motion quality" },
	{ id: "veo3.1", label: "Veo 3.1", description: "Google Veo 3.1 via FAL AI, high quality with audio generation" },
	{ id: "veo3.1-fast", label: "Veo 3.1 Fast", description: "Faster Veo 3.1 generation, good for testing" },
];

const AVATAR_ENGINES: { id: DirectorAvatarEngine; label: string; description: string }[] = [
	{ id: "omnihuman", label: "Omnihuman", description: "High quality talking head generation (recommended)" },
	{ id: "aurora", label: "Aurora", description: "Fast avatar video generation" },
];

const VOICE_OPTIONS: { id: DirectorVoiceId; label: string; description: string }[] = [
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
	component: DirectorSetupPage,
});

// ============================================================================
// Component
// ============================================================================

function DirectorSetupPage() {
	const navigate = useNavigate();

	// React Query mutations
	const generateCharacterMutation = useGenerateDirectorCharacter();
	const uploadCharacterMutation = useUploadDirectorCharacter();

	// Subscribe to store state
	const storyId = useStore(directorStore, (s) => s.storyId);
	const title = useStore(directorStore, (s) => s.title);
	const defaultImageEngine = useStore(directorStore, (s) => s.defaultImageEngine);
	const defaultImageStyle = useStore(directorStore, (s) => s.defaultImageStyle);
	const defaultVideoEngine = useStore(directorStore, (s) => s.defaultVideoEngine);
	const defaultAvatarEngine = useStore(directorStore, (s) => s.defaultAvatarEngine);
	const defaultVoiceId = useStore(directorStore, (s) => s.defaultVoiceId);
	const defaultVoiceSpeed = useStore(directorStore, (s) => s.defaultVoiceSpeed);
	const captionLanguage = useStore(directorStore, (s) => s.captionLanguage);
	const character = useStore(directorStore, (s) => s.character);
	const error = useStore(directorStore, (s) => s.error);
	const promptsGenerated = useStore(directorStore, (s) => s.promptsGenerated);

	// Local state
	const [characterPrompt, setCharacterPrompt] = useState(character?.imagePrompt || "");
	const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);
	const [isAssetPickerOpen, setIsAssetPickerOpen] = useState(false);
	const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);

	// Refs
	const fileInputRef = useRef<HTMLInputElement>(null);
	const uploadMenuRef = useRef<HTMLDivElement>(null);
	const titleInputId = useId();

	// Effect: Sync character prompt from store
	useEffect(() => {
		if (character?.imagePrompt) {
			setCharacterPrompt(character.imagePrompt);
		}
	}, [character?.imagePrompt]);

	// Effect: Close upload menu on outside click
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (uploadMenuRef.current && !uploadMenuRef.current.contains(event.target as Node)) {
				setIsUploadMenuOpen(false);
			}
		};
		if (isUploadMenuOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isUploadMenuOpen]);

	// Handle character generation
	const handleGenerateCharacter = async () => {
		if (!characterPrompt.trim() || !storyId) return;

		setIsGeneratingCharacter(true);
		directorActions.setError(null);

		generateCharacterMutation.mutate(
			{
				prompt: characterPrompt,
				storyId,
				imageEngine: defaultImageEngine,
				imageStyle: defaultImageStyle,
			},
			{
				onSuccess: (result) => {
					if (result.success && result.imageUrl) {
						directorActions.setCharacter({
							id: `char-${Date.now()}`,
							name: "Main Character",
							imagePrompt: characterPrompt,
							imageUrl: result.imageUrl,
							imageId: result.imageId || null,
							imageSource: "generate",
							imageEngine: defaultImageEngine,
							voiceId: defaultVoiceId,
							voiceSpeed: defaultVoiceSpeed,
							videoEngine: defaultVideoEngine,
							isGenerating: false,
							imageStatus: "completed",
						});
					} else {
						directorActions.setError(result.error || "Failed to generate character");
					}
					setIsGeneratingCharacter(false);
				},
				onError: (err) => {
					directorActions.setError(
						err instanceof Error ? err.message : "Failed to generate character",
					);
					setIsGeneratingCharacter(false);
				},
			},
		);
	};

	// Handle character upload from file
	const handleUploadCharacter = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file || !storyId) return;

		setIsGeneratingCharacter(true);
		directorActions.setError(null);

		const reader = new FileReader();
		reader.onload = (e) => {
			const base64 = (e.target?.result as string).split(",")[1]; // Remove data:image/...;base64, prefix

			uploadCharacterMutation.mutate(
				{
					imageBase64: base64,
					storyId,
				},
				{
					onSuccess: (result) => {
						if (result.success && result.imageUrl) {
							directorActions.setCharacter({
								id: `char-${Date.now()}`,
								name: "Uploaded Character",
								imagePrompt: characterPrompt || "Uploaded character image",
								imageUrl: result.imageUrl,
								imageId: result.imageId || null,
								imageSource: "upload",
								imageEngine: defaultImageEngine,
								voiceId: defaultVoiceId,
								voiceSpeed: defaultVoiceSpeed,
								videoEngine: defaultVideoEngine,
								isGenerating: false,
								imageStatus: "completed",
							});
						} else {
							directorActions.setError(result.error || "Failed to upload character");
						}
						setIsGeneratingCharacter(false);
					},
					onError: (err) => {
						directorActions.setError(
							err instanceof Error ? err.message : "Failed to upload character",
						);
						setIsGeneratingCharacter(false);
					},
				},
			);
		};
		reader.readAsDataURL(file);
		event.target.value = "";
	};

	// Handle import from asset library
	const handleImportFromAssets = (imageUrl: string, imageId: string) => {
		directorActions.setCharacter({
			id: `char-${Date.now()}`,
			name: "Imported Character",
			imagePrompt: characterPrompt || "Imported from asset library",
			imageUrl,
			imageId,
			imageSource: "upload",
			imageEngine: defaultImageEngine,
			voiceId: defaultVoiceId,
			voiceSpeed: defaultVoiceSpeed,
			videoEngine: defaultVideoEngine,
			isGenerating: false,
			imageStatus: "completed",
		});
		setIsAssetPickerOpen(false);
	};

	// Navigate to scenes page
	const handleContinueToScenes = () => {
		// Mark prompts as generated to allow navigation
		directorActions.setPromptsGenerated(true);
		navigate({ to: "/director-mode/scenes" });
	};

	// Check if can continue
	const canContinue = title.trim() && character?.imageUrl;

	return (
		<div className="space-y-8">
			{/* Hidden file input */}
			<input
				type="file"
				ref={fileInputRef}
				onChange={handleUploadCharacter}
				accept="image/*"
				className="hidden"
			/>

			{/* Title Input Section */}
			<Card className="rounded-2xl">
				<CardContent>
					<label htmlFor={titleInputId} className="block text-xl font-semibold text-foreground mb-4">
						Story Title
					</label>
					<input
						id={titleInputId}
						type="text"
						value={title}
						onChange={(e) => directorActions.setTitle(e.target.value)}
						placeholder="Enter your story title..."
						className="w-full px-4 py-3 bg-muted border border-border rounded-lg text-foreground placeholder-muted-foreground focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-colors"
						disabled={promptsGenerated}
					/>
				</CardContent>
			</Card>

			{/* Default Engine Settings */}
			<Card className="rounded-2xl">
				<CardContent>
					<h2 className="text-xl font-semibold text-foreground mb-4">Default Engine Settings</h2>
					<p className="text-sm text-muted-foreground mb-6">
						These settings will be applied to new scenes. You can override them per-scene later.
					</p>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						{/* Image Style */}
						<div>
							<label className="block text-sm font-medium text-muted-foreground mb-2">Image Style</label>
							<select
								value={defaultImageStyle}
								onChange={(e) => directorActions.setDefaultImageStyle(e.target.value as DirectorImageStyle)}
								disabled={promptsGenerated}
								className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
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
								disabled={promptsGenerated}
								className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
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
								disabled={promptsGenerated}
								className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
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
								disabled={promptsGenerated}
								className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
								disabled={promptsGenerated}
								className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
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
								disabled={promptsGenerated}
								className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
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
					<div className="mt-6 pt-6 border-t border-border">
						<label className="block text-sm font-medium text-muted-foreground mb-3">Caption Language</label>
						<div className={`inline-flex rounded-lg bg-muted p-1 ${promptsGenerated ? "opacity-50 pointer-events-none" : ""}`}>
							{CAPTION_LANGUAGES.map((lang) => (
								<Button
									key={lang.id}
									type="button"
									variant={captionLanguage === lang.id ? "default" : "ghost"}
									size="sm"
									onClick={() => directorActions.setCaptionLanguage(lang.id)}
									disabled={promptsGenerated}
									className={captionLanguage === lang.id
										? "bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm"
										: "text-muted-foreground hover:text-foreground"}
								>
									{lang.label}
								</Button>
							))}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Character Generator */}
			<Card className="rounded-2xl">
				<CardContent className="p-6">
					<h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
						<User className="w-5 h-5 text-cyan-400" />
						Character (16:9)
					</h3>

					<div className="flex gap-6">
						{/* Left side: prompt + buttons */}
						<div className="flex-1 min-w-0">
							<textarea
								value={characterPrompt}
								onChange={(e) => setCharacterPrompt(e.target.value)}
								className="w-full h-40 px-4 py-3 bg-background border border-border rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors resize-none"
								disabled={isGeneratingCharacter || promptsGenerated}
								placeholder="Describe your character's appearance, clothing, pose, background... This will be used as reference for 16:9 landscape scenes."
							/>

							{/* Character generation buttons */}
							<div className="mt-3 flex gap-3">
								<Button
									onClick={handleGenerateCharacter}
									disabled={!characterPrompt.trim() || isGeneratingCharacter || promptsGenerated}
									className="flex-1 py-3 h-auto bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 disabled:from-muted disabled:to-muted disabled:cursor-not-allowed text-foreground font-semibold rounded-lg transition-all duration-300 shadow-md shadow-cyan-500/20 hover:shadow-cyan-500/40 disabled:shadow-none flex items-center justify-center gap-2"
								>
									{isGeneratingCharacter ? (
										<>
											<Loader2 className="w-5 h-5 animate-spin" />
											Generating...
										</>
									) : (
										<>
											<ImageIcon className="w-5 h-5" />
											GENERATE CHARACTER
										</>
									)}
								</Button>

								{/* Upload/Import dropdown */}
								<div ref={uploadMenuRef} className="relative flex-1">
									<Button
										variant="secondary"
										onClick={() => setIsUploadMenuOpen(!isUploadMenuOpen)}
										disabled={isGeneratingCharacter || promptsGenerated}
										className="w-full py-3 h-auto font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
									>
										<Upload className="w-5 h-5" />
										UPLOAD / IMPORT
										<ChevronDown className="w-4 h-4" />
									</Button>
									{isUploadMenuOpen && (
										<div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-10 overflow-hidden">
											<button
												type="button"
												onClick={() => {
													fileInputRef.current?.click();
													setIsUploadMenuOpen(false);
												}}
												className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-accent transition-colors flex items-center gap-3"
											>
												<Upload className="w-4 h-4 text-muted-foreground" />
												From Local File
											</button>
											<button
												type="button"
												onClick={() => {
													setIsAssetPickerOpen(true);
													setIsUploadMenuOpen(false);
												}}
												className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-accent transition-colors flex items-center gap-3 border-t border-border"
											>
												<FolderOpen className="w-4 h-4 text-purple-400" />
												From Asset Library
											</button>
										</div>
									)}
								</div>
							</div>
						</div>

						{/* Right side: 16:9 character preview */}
						<div className="w-64 flex-shrink-0">
							{character?.imageUrl ? (
								<img
									src={character.imageUrl}
									alt="Character preview"
									className="w-full rounded-lg shadow-lg object-cover"
									style={{ aspectRatio: "16/9" }}
								/>
							) : (
								<div
									className="w-full bg-muted border border-border rounded-lg flex items-center justify-center text-muted-foreground"
									style={{ aspectRatio: "16/9" }}
								>
									<div className="text-center p-4">
										<ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
										<span className="text-xs">16:9 Preview</span>
									</div>
								</div>
							)}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Error Display */}
			{error && (
				<ErrorWithRetry
					error={error.message}
					onRetry={handleGenerateCharacter}
					onDismiss={() => directorActions.setError(null)}
					isRetrying={isGeneratingCharacter}
				/>
			)}

			{/* Action Button */}
			<div className="flex gap-4">
				{!promptsGenerated ? (
					<Button
						type="button"
						onClick={handleContinueToScenes}
						disabled={!canContinue}
						size="lg"
						className="flex-1 py-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:from-muted disabled:to-muted disabled:cursor-not-allowed text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 disabled:shadow-none"
					>
						Continue to Scenes
						<ArrowRight className="w-6 h-6 ml-2" />
					</Button>
				) : (
					<Button
						type="button"
						onClick={() => navigate({ to: "/director-mode/scenes" })}
						size="lg"
						className="flex-1 py-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50"
					>
						Go to Scenes
						<ArrowRight className="w-6 h-6 ml-2" />
					</Button>
				)}
			</div>

			{/* Asset Picker Modal */}
			<AssetPickerModal
				isOpen={isAssetPickerOpen}
				onClose={() => setIsAssetPickerOpen(false)}
				onSelect={handleImportFromAssets}
				title="Select Character Image (16:9)"
			/>
		</div>
	);
}
