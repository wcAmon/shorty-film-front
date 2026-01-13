import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import {
	ChevronDown,
	ChevronUp,
	Download,
	Film,
	ImageIcon,
	Loader2,
	Mic,
	Play,
	Plus,
	Settings,
	Trash2,
	Upload,
	User,
	Users,
	Volume2,
} from "lucide-react";
import { useRef, useState } from "react";
import { CountdownProgress } from "@/components/countdown-progress";
import {
	useGeneratePodcast42Character,
	useGeneratePodcast42SceneAudio,
	useGeneratePodcast42SceneVideo,
	useUpdatePodcast42Settings,
	useUploadPodcast42Character,
} from "@/hooks/use-podcast42-api";
import {
	podcast42Actions,
	podcast42Store,
	type Podcast42Speaker,
	type Podcast42VideoEngine,
} from "@/stores/podcast42.store";
import type { ImageEngine, ImageStyle, VoiceId } from "@/stores/aistory.store";

// Voice options for display
const VOICE_OPTIONS: Array<{ id: VoiceId; name: string }> = [
	{ id: "PIGsltMj3gFMR34aFDI3", name: "Jonathan" },
	{ id: "Z3R5wn05IrDiVCyEkUrK", name: "Arabella" },
	{ id: "n1PvBOwxb8X6m7tahp2h", name: "Michael" },
	{ id: "ZF6FPAbjXT4488VcRRnw", name: "Amelia" },
	{ id: "ICwKbPHDHAM3eal5tHEZ", name: "Tony" },
	{ id: "cgLpYGyXZhkyalKZ0xeZ", name: "Knox" },
	{ id: "YKrm0N1EAM9Bw27j8kuD", name: "Leonidas" },
];

// Image style options for display
const IMAGE_STYLE_OPTIONS: Array<{ id: ImageStyle; name: string }> = [
	{ id: "cinematic", name: "Cinematic" },
	{ id: "comic", name: "Comic" },
	{ id: "low-poly", name: "Low Poly" },
	{ id: "japanese-anime", name: "Japanese Anime" },
	{ id: "clay", name: "Clay" },
];

export const Route = createFileRoute("/podcast42/scenes")({
	beforeLoad: () => {
		const state = podcast42Store.state;
		if (!state.promptsGenerated || !state.person1Prompt || !state.person2Prompt) {
			throw redirect({ to: "/podcast42" });
		}
	},
	component: Podcast42ScenesPage,
});

function Podcast42ScenesPage() {
	const navigate = useNavigate();

	// React Query mutations
	const generateCharacterMutation = useGeneratePodcast42Character();
	const uploadCharacterMutation = useUploadPodcast42Character();
	const generateSceneAudioMutation = useGeneratePodcast42SceneAudio();
	const generateSceneVideoMutation = useGeneratePodcast42SceneVideo();
	const updateSettingsMutation = useUpdatePodcast42Settings();

	// Subscribe to store state
	const person1Prompt = useStore(podcast42Store, (state) => state.person1Prompt);
	const person1Image = useStore(podcast42Store, (state) => state.person1Image);
	const person1ImageUrl = useStore(podcast42Store, (state) => state.person1ImageUrl);
	const isGeneratingPerson1 = useStore(podcast42Store, (state) => state.isGeneratingPerson1);

	const person2Prompt = useStore(podcast42Store, (state) => state.person2Prompt);
	const person2Image = useStore(podcast42Store, (state) => state.person2Image);
	const person2ImageUrl = useStore(podcast42Store, (state) => state.person2ImageUrl);
	const isGeneratingPerson2 = useStore(podcast42Store, (state) => state.isGeneratingPerson2);

	const scenes = useStore(podcast42Store, (state) => state.scenes);
	const sceneError = useStore(podcast42Store, (state) => state.sceneError);
	const imageEngine = useStore(podcast42Store, (state) => state.imageEngine);
	const imageStyle = useStore(podcast42Store, (state) => state.imageStyle);
	const person1VoiceId = useStore(podcast42Store, (state) => state.person1VoiceId);
	const person2VoiceId = useStore(podcast42Store, (state) => state.person2VoiceId);
	const storyId = useStore(podcast42Store, (state) => state.storyId);
	const videoEngine = useStore(podcast42Store, (state) => state.videoEngine);

	// Audio playback state
	const [playingSceneId, setPlayingSceneId] = useState<string | null>(null);
	const [currentWordIndex, setCurrentWordIndex] = useState<number | null>(null);

	// Refs
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const person1FileInputRef = useRef<HTMLInputElement>(null);
	const person2FileInputRef = useRef<HTMLInputElement>(null);

	// Handle character image upload
	const handleUploadCharacter = (
		person: "person1" | "person2",
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		if (!file) return;

		const setIsGenerating =
			person === "person1"
				? podcast42Actions.setIsGeneratingPerson1
				: podcast42Actions.setIsGeneratingPerson2;
		const setImage =
			person === "person1"
				? podcast42Actions.setPerson1Image
				: podcast42Actions.setPerson2Image;

		podcast42Actions.setError(null);
		setIsGenerating(true);

		const reader = new FileReader();
		reader.onload = (e) => {
			const img = new Image();
			img.onload = async () => {
				// Calculate 16:9 crop region for podcast42 (1280x720)
				const targetRatio = 16 / 9;
				const imgRatio = img.width / img.height;

				let cropWidth: number;
				let cropHeight: number;
				let cropX: number;
				let cropY: number;

				if (imgRatio > targetRatio) {
					// Image is wider than target - crop sides
					cropHeight = img.height;
					cropWidth = cropHeight * targetRatio;
					cropX = (img.width - cropWidth) / 2;
					cropY = 0;
				} else {
					// Image is taller than target - crop top/bottom
					cropWidth = img.width;
					cropHeight = cropWidth / targetRatio;
					cropX = 0;
					cropY = (img.height - cropHeight) / 2;
				}

				// Use Canvas to crop and scale to 16:9 target dimensions (1280x720 for podcast42)
				const canvas = document.createElement("canvas");
				canvas.width = 1280;
				canvas.height = 720;
				const ctx = canvas.getContext("2d");

				if (ctx) {
					ctx.drawImage(
						img,
						cropX,
						cropY,
						cropWidth,
						cropHeight,
						0,
						0,
						1280,
						720,
					);

					const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
					setImage(base64);

					if (!storyId) {
						podcast42Actions.setError("Story ID is required");
						setIsGenerating(false);
						return;
					}

					uploadCharacterMutation.mutate(
						{ imageBase64: base64, person, storyId },
						{
							onSuccess: (result) => {
								if (result.success && result.imageUrl) {
									if (person === "person1") {
										podcast42Actions.setPerson1ImageUrl(result.imageUrl);
									} else {
										podcast42Actions.setPerson2ImageUrl(result.imageUrl);
									}
								} else {
									podcast42Actions.setError(
										result.error ?? "Failed to upload character image",
									);
								}
								setIsGenerating(false);
							},
							onError: (err) => {
								podcast42Actions.setError(
									err instanceof Error
										? err.message
										: "Failed to upload character image",
								);
								setIsGenerating(false);
							},
						},
					);
				} else {
					setIsGenerating(false);
				}
			};
			img.src = e.target?.result as string;
		};
		reader.readAsDataURL(file);

		event.target.value = "";
	};

	// Handle character generation from prompt
	const handleGenerateCharacter = (person: "person1" | "person2") => {
		const prompt = person === "person1" ? person1Prompt : person2Prompt;
		if (!prompt?.trim() || !storyId) return;

		const setIsGenerating =
			person === "person1"
				? podcast42Actions.setIsGeneratingPerson1
				: podcast42Actions.setIsGeneratingPerson2;

		setIsGenerating(true);
		podcast42Actions.setError(null);

		generateCharacterMutation.mutate(
			{ prompt, storyId, imageEngine, imageStyle, person },
			{
				onSuccess: (result) => {
					if (result.success && result.imageBase64) {
						if (person === "person1") {
							podcast42Actions.setPerson1Image(result.imageBase64);
							if (result.imageUrl) {
								podcast42Actions.setPerson1ImageUrl(result.imageUrl);
							}
						} else {
							podcast42Actions.setPerson2Image(result.imageBase64);
							if (result.imageUrl) {
								podcast42Actions.setPerson2ImageUrl(result.imageUrl);
							}
						}
					} else {
						podcast42Actions.setError(
							result.error || "Failed to generate character image",
						);
					}
					setIsGenerating(false);
				},
				onError: (err) => {
					podcast42Actions.setError(
						err instanceof Error ? err.message : "An unexpected error occurred",
					);
					setIsGenerating(false);
				},
			},
		);
	};

	// Update person prompt
	const handleUpdatePersonPrompt = (
		person: "person1" | "person2",
		newPrompt: string,
	) => {
		if (person === "person1") {
			podcast42Actions.setPerson1Prompt(newPrompt);
		} else {
			podcast42Actions.setPerson2Prompt(newPrompt);
		}
	};

	// Update scene caption (editable)
	const handleUpdateSceneCaption = (sceneId: string, newCaption: string) => {
		podcast42Actions.updateScene(sceneId, { caption: newCaption });
	};

	// Update scene speaker
	const handleUpdateSceneSpeaker = (
		sceneId: string,
		speaker: Podcast42Speaker,
	) => {
		podcast42Actions.updateScene(sceneId, { speaker });
	};

	// Handle single scene audio generation
	const handleGenerateSceneAudio = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
		if (!scene || sceneIndex === -1 || !storyId) return;

		// Get the appropriate voice for this speaker
		const voiceId = scene.speaker === "person1" ? person1VoiceId : person2VoiceId;

		podcast42Actions.updateScene(sceneId, { isGeneratingAudio: true });

		generateSceneAudioMutation.mutate(
			{ caption: scene.caption, storyId, sceneIndex, voiceId },
			{
				onSuccess: (result) => {
					if (result.success && result.audioBase64) {
						podcast42Actions.updateScene(sceneId, {
							audioBase64: result.audioBase64,
							audioDuration: result.audioDuration,
							wordTimestamps: result.wordTimestamps,
							isGeneratingAudio: false,
						});
					} else {
						podcast42Actions.updateScene(sceneId, { isGeneratingAudio: false });
						podcast42Actions.setSceneError(
							result.error || "Failed to generate scene audio",
						);
					}
				},
				onError: (err) => {
					podcast42Actions.updateScene(sceneId, { isGeneratingAudio: false });
					podcast42Actions.setSceneError(
						err instanceof Error ? err.message : "An unexpected error occurred",
					);
				},
			},
		);
	};

	// Handle single scene video generation using OmniHuman or Aurora
	const handleGenerateSceneVideo = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
		if (!scene || sceneIndex === -1 || !storyId || !scene.audioBase64) return;

		// Get the appropriate character image URL for this speaker
		const imageUrl =
			scene.speaker === "person1" ? person1ImageUrl : person2ImageUrl;
		if (!imageUrl) {
			podcast42Actions.setSceneError(
				`Please generate ${scene.speaker === "person1" ? "Person 1" : "Person 2"} image first`,
			);
			return;
		}

		podcast42Actions.updateScene(sceneId, {
			isGeneratingVideo: true,
			videoError: null,
		});

		generateSceneVideoMutation.mutate(
			{
				storyId,
				sceneIndex,
				imageUrl,
				audioBase64: scene.audioBase64,
				videoEngine,
				onStatusUpdate: (status) => {
					console.log(`[video] Scene ${sceneId} status: ${status} (engine: ${videoEngine})`);
				},
			},
			{
				onSuccess: (result) => {
					if (result.success && result.videoBase64) {
						podcast42Actions.updateScene(sceneId, {
							videoBase64: result.videoBase64,
							videoDuration: result.videoDuration,
							isGeneratingVideo: false,
							videoError: null,
						});
					} else {
						podcast42Actions.updateScene(sceneId, {
							isGeneratingVideo: false,
							videoError: result.error || "Failed to generate scene video",
						});
					}
				},
				onError: (err) => {
					podcast42Actions.updateScene(sceneId, {
						isGeneratingVideo: false,
						videoError:
							err instanceof Error
								? err.message
								: "An unexpected error occurred",
					});
				},
			},
		);
	};

	// Play scene audio with word-by-word caption synchronization
	const handlePlaySceneAudio = (sceneId: string) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene?.audioBase64) return;

		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current = null;
		}

		const audio = new Audio(`data:audio/mp3;base64,${scene.audioBase64}`);
		audioRef.current = audio;

		setPlayingSceneId(sceneId);
		setCurrentWordIndex(scene.wordTimestamps?.length ? 0 : null);

		if (scene.wordTimestamps?.length) {
			audio.addEventListener("timeupdate", () => {
				const currentTime = audio.currentTime;
				const idx =
					scene.wordTimestamps?.findIndex(
						(wt) => currentTime >= wt.startTime && currentTime < wt.endTime,
					) ?? -1;

				if (idx !== -1) {
					setCurrentWordIndex(idx);
				}
			});
		}

		audio.addEventListener("ended", () => {
			setPlayingSceneId(null);
			setCurrentWordIndex(null);
			audioRef.current = null;
		});

		audio.play();
	};

	// Download scene audio
	const handleDownloadAudio = (sceneId: string, sceneIndex: number) => {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene?.audioBase64) return;

		const link = document.createElement("a");
		link.href = `data:audio/mp3;base64,${scene.audioBase64}`;
		link.download = `scene_${sceneIndex + 1}.mp3`;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	};

	// Settings handlers that update both store and metadata
	const handleImageEngineChange = (engine: ImageEngine) => {
		podcast42Actions.setImageEngine(engine);
		if (storyId) {
			updateSettingsMutation.mutate({ storyId, imageEngine: engine });
		}
	};

	const handleImageStyleChange = (style: ImageStyle) => {
		podcast42Actions.setImageStyle(style);
		if (storyId) {
			updateSettingsMutation.mutate({ storyId, imageStyle: style });
		}
	};

	const handleVideoEngineChange = (engine: Podcast42VideoEngine) => {
		podcast42Actions.setVideoEngine(engine);
		if (storyId) {
			updateSettingsMutation.mutate({ storyId, videoEngine: engine });
		}
	};

	const handlePerson1VoiceChange = (voiceId: VoiceId) => {
		podcast42Actions.setPerson1VoiceId(voiceId);
		if (storyId) {
			updateSettingsMutation.mutate({ storyId, person1VoiceId: voiceId });
		}
	};

	const handlePerson2VoiceChange = (voiceId: VoiceId) => {
		podcast42Actions.setPerson2VoiceId(voiceId);
		if (storyId) {
			updateSettingsMutation.mutate({ storyId, person2VoiceId: voiceId });
		}
	};

	// Check if scene editing should be disabled (no character images)
	const scenesDisabled = !person1Image || !person2Image;

	// Check if all scenes have videos generated (for export button)
	const allScenesHaveVideos =
		scenes.length > 0 &&
		scenes.every((scene) => scene.videoBase64 && scene.audioBase64);

	// Navigate to export page
	const handleExportMyVideo = () => {
		navigate({ to: "/podcast42/export" });
	};

	// Render character card
	const renderCharacterCard = (
		person: "person1" | "person2",
		title: string,
		prompt: string | null,
		image: string | null,
		isGenerating: boolean,
		fileInputRef: React.RefObject<HTMLInputElement | null>,
		accentColor: string,
	) => (
		<div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
			<h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
				<User className={`w-5 h-5 ${accentColor}`} />
				{title}
			</h3>

			<div className="flex gap-6">
				{/* Left side: prompt textarea + buttons */}
				<div className="flex-1 min-w-0">
					<textarea
						value={prompt || ""}
						onChange={(e) => handleUpdatePersonPrompt(person, e.target.value)}
						className={`w-full h-32 px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-${person === "person1" ? "emerald" : "rose"}-500 focus:ring-1 focus:ring-${person === "person1" ? "emerald" : "rose"}-500 transition-colors resize-none`}
						disabled={isGenerating}
						placeholder={`${title} description prompt...`}
					/>

					{/* Character generation button group */}
					<div className="mt-3 flex gap-3">
						<button
							type="button"
							onClick={() => handleGenerateCharacter(person)}
							disabled={!prompt?.trim() || isGenerating}
							className={`flex-1 py-3 bg-gradient-to-r ${
								person === "person1"
									? "from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-emerald-500/20 hover:shadow-emerald-500/40"
									: "from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 shadow-rose-500/20 hover:shadow-rose-500/40"
							} disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 shadow-md disabled:shadow-none flex items-center justify-center gap-2`}
						>
							{isGenerating ? (
								<>
									<Loader2 className="w-5 h-5 animate-spin" />
									Generating...
								</>
							) : (
								<>
									<ImageIcon className="w-5 h-5" />
									GENERATE
								</>
							)}
						</button>
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							disabled={isGenerating}
							className="flex-1 py-3 bg-gradient-to-r from-slate-600 to-slate-500 hover:from-slate-500 hover:to-slate-400 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 shadow-md shadow-slate-500/20 hover:shadow-slate-500/40 disabled:shadow-none flex items-center justify-center gap-2"
						>
							<Upload className="w-5 h-5" />
							UPLOAD
						</button>
					</div>
				</div>

				{/* Right side: character image preview (16:9 landscape) */}
				<div className="w-48 flex-shrink-0">
					{image ? (
						<img
							src={`data:image/jpeg;base64,${image}`}
							alt={`${title} portrait`}
							className="w-full rounded-lg shadow-lg object-cover"
							style={{ aspectRatio: "16/9" }}
						/>
					) : (
						<div
							className="w-full bg-slate-900/50 border border-slate-600 rounded-lg flex items-center justify-center text-slate-500"
							style={{ aspectRatio: "16/9" }}
						>
							<div className="text-center p-2">
								<ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-50" />
								<span className="text-xs">16:9</span>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);

	return (
		<div className="space-y-8">
			{/* Hidden file upload inputs */}
			<input
				type="file"
				ref={person1FileInputRef}
				onChange={(e) => handleUploadCharacter("person1", e)}
				accept="image/*"
				className="hidden"
			/>
			<input
				type="file"
				ref={person2FileInputRef}
				onChange={(e) => handleUploadCharacter("person2", e)}
				accept="image/*"
				className="hidden"
			/>

			{/* Settings Panel */}
			<div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
				<h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
					<Settings className="w-5 h-5 text-amber-400" />
					Generation Settings
				</h2>

				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{/* Image Engine */}
					<div>
						<label className="block text-sm font-medium text-slate-300 mb-2">
							Image Engine
						</label>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => handleImageEngineChange("flux-pro")}
								className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
									imageEngine === "flux-pro"
										? "bg-amber-500 text-white"
										: "bg-slate-700 text-slate-300 hover:bg-slate-600"
								}`}
							>
								Flux Pro
							</button>
							<button
								type="button"
								onClick={() => handleImageEngineChange("gpt-image")}
								className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
									imageEngine === "gpt-image"
										? "bg-amber-500 text-white"
										: "bg-slate-700 text-slate-300 hover:bg-slate-600"
								}`}
							>
								GPT Image
							</button>
						</div>
					</div>

					{/* Image Style */}
					<div>
						<label className="block text-sm font-medium text-slate-300 mb-2">
							Image Style
						</label>
						<select
							value={imageStyle}
							onChange={(e) =>
								handleImageStyleChange(e.target.value as ImageStyle)
							}
							className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500"
						>
							{IMAGE_STYLE_OPTIONS.map((style) => (
								<option key={style.id} value={style.id}>
									{style.name}
								</option>
							))}
						</select>
					</div>

					{/* Video Engine */}
					<div>
						<label className="block text-sm font-medium text-slate-300 mb-2">
							Video Engine
						</label>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => handleVideoEngineChange("omnihuman")}
								className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
									videoEngine === "omnihuman"
										? "bg-amber-500 text-white"
										: "bg-slate-700 text-slate-300 hover:bg-slate-600"
								}`}
							>
								OmniHuman
							</button>
							<button
								type="button"
								onClick={() => handleVideoEngineChange("aurora")}
								className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
									videoEngine === "aurora"
										? "bg-amber-500 text-white"
										: "bg-slate-700 text-slate-300 hover:bg-slate-600"
								}`}
							>
								Aurora
							</button>
						</div>
					</div>

					{/* Person 1 Voice */}
					<div>
						<label className="block text-sm font-medium text-emerald-400 mb-2">
							Person 1 Voice
						</label>
						<select
							value={person1VoiceId}
							onChange={(e) =>
								handlePerson1VoiceChange(e.target.value as VoiceId)
							}
							className="w-full px-3 py-2 bg-slate-700 border border-emerald-600/50 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
						>
							{VOICE_OPTIONS.map((voice) => (
								<option key={voice.id} value={voice.id}>
									{voice.name}
								</option>
							))}
						</select>
					</div>

					{/* Person 2 Voice */}
					<div>
						<label className="block text-sm font-medium text-rose-400 mb-2">
							Person 2 Voice
						</label>
						<select
							value={person2VoiceId}
							onChange={(e) =>
								handlePerson2VoiceChange(e.target.value as VoiceId)
							}
							className="w-full px-3 py-2 bg-slate-700 border border-rose-600/50 rounded-lg text-white text-sm focus:outline-none focus:border-rose-500"
						>
							{VOICE_OPTIONS.map((voice) => (
								<option key={voice.id} value={voice.id}>
									{voice.name}
								</option>
							))}
						</select>
					</div>
				</div>
			</div>

			{/* Characters Section */}
			<div className="space-y-4">
				<h2 className="text-xl font-semibold text-white flex items-center gap-2">
					<Users className="w-6 h-6 text-amber-400" />
					Characters
				</h2>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					{renderCharacterCard(
						"person1",
						"Person 1",
						person1Prompt,
						person1Image,
						isGeneratingPerson1,
						person1FileInputRef,
						"text-emerald-400",
					)}
					{renderCharacterCard(
						"person2",
						"Person 2",
						person2Prompt,
						person2Image,
						isGeneratingPerson2,
						person2FileInputRef,
						"text-rose-400",
					)}
				</div>
			</div>

			{/* Scene error message */}
			{sceneError && (
				<div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300">
					{sceneError}
				</div>
			)}

			{/* Scene card list */}
			{scenes.length > 0 && (
				<div className="space-y-6">
					<h2 className="text-xl font-semibold text-white flex items-center gap-2">
						<Mic className="w-6 h-6 text-amber-400" />
						Dialogue Scenes
					</h2>

					{/* Disabled overlay message */}
					{scenesDisabled && (
						<div className="p-4 bg-amber-500/20 border border-amber-500/50 rounded-xl text-amber-300 text-center">
							Please generate or upload both character images to enable scene
							editing
						</div>
					)}

					{scenes.map((scene, index) => (
						<div
							key={scene.id}
							className={`bg-slate-800/50 border border-slate-700 rounded-xl p-6 ${
								scenesDisabled ? "opacity-50 pointer-events-none" : ""
							}`}
						>
							{/* Scene header with controls */}
							<div className="flex items-center justify-between mb-4">
								<h3 className="text-lg font-semibold text-white flex items-center gap-2">
									<span
										className={`px-2 py-1 rounded text-xs font-bold ${
											scene.speaker === "person1"
												? "bg-emerald-500/20 text-emerald-400"
												: "bg-rose-500/20 text-rose-400"
										}`}
									>
										{scene.speaker === "person1" ? "Person 1" : "Person 2"}
									</span>
									Scene {index + 1}
								</h3>
								<div className="flex items-center gap-3">
									{/* Speaker toggle */}
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() =>
												handleUpdateSceneSpeaker(scene.id, "person1")
											}
											className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
												scene.speaker === "person1"
													? "bg-emerald-500 text-white"
													: "bg-slate-700 text-slate-300 hover:bg-slate-600"
											}`}
											disabled={scenesDisabled}
										>
											P1
										</button>
										<button
											type="button"
											onClick={() =>
												handleUpdateSceneSpeaker(scene.id, "person2")
											}
											className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
												scene.speaker === "person2"
													? "bg-rose-500 text-white"
													: "bg-slate-700 text-slate-300 hover:bg-slate-600"
											}`}
											disabled={scenesDisabled}
										>
											P2
										</button>
									</div>
									{/* Reorder buttons */}
									<div className="flex items-center gap-1">
										<button
											type="button"
											onClick={() =>
												podcast42Actions.reorderScenes(index, index - 1)
											}
											disabled={index === 0 || scenesDisabled}
											className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
											title="Move up"
										>
											<ChevronUp className="w-4 h-4" />
										</button>
										<button
											type="button"
											onClick={() =>
												podcast42Actions.reorderScenes(index, index + 1)
											}
											disabled={index === scenes.length - 1 || scenesDisabled}
											className="p-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
											title="Move down"
										>
											<ChevronDown className="w-4 h-4" />
										</button>
									</div>
									{/* Delete button */}
									<button
										type="button"
										onClick={() => podcast42Actions.deleteScene(scene.id)}
										disabled={scenes.length <= 1 || scenesDisabled}
										className="p-1 text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
										title="Delete scene"
									>
										<Trash2 className="w-4 h-4" />
									</button>
								</div>
							</div>

							{/* Two-column layout: left caption + buttons, right video */}
							<div className="flex gap-6">
								{/* Left side: caption editor + audio/video buttons */}
								<div className="flex-1 min-w-0">
									{/* Caption editor */}
									<div>
										<span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
											Dialogue
										</span>
										<textarea
											value={scene.caption}
											onChange={(e) =>
												handleUpdateSceneCaption(scene.id, e.target.value)
											}
											className="mt-1 w-full h-24 px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors resize-none"
											disabled={scene.isGeneratingAudio || scenesDisabled}
											placeholder="Enter dialogue text..."
										/>
									</div>

									{/* Audio generation button */}
									<div className="mt-3">
										<button
											type="button"
											onClick={() => handleGenerateSceneAudio(scene.id)}
											disabled={
												!scene.caption.trim() ||
												scene.isGeneratingAudio ||
												scenesDisabled
											}
											className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40 disabled:shadow-none flex items-center justify-center gap-2"
										>
											{scene.isGeneratingAudio ? (
												<>
													<Loader2 className="w-5 h-5 animate-spin" />
													Generating Audio...
												</>
											) : (
												<>
													<Volume2 className="w-5 h-5" />
													GENERATE AUDIO
												</>
											)}
										</button>
									</div>

									{/* Video generation section */}
									<div className="mt-3">
										{/* Video generation error message */}
										{scene.videoError && (
											<div className="mb-2 p-2 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
												{scene.videoError}
											</div>
										)}
										{/* Progress bar for video generation (3 minutes) */}
										<CountdownProgress
											isActive={scene.isGeneratingVideo ?? false}
											durationSeconds={180}
										/>
										<button
											type="button"
											onClick={() => handleGenerateSceneVideo(scene.id)}
											disabled={
												!scene.audioBase64 ||
												scene.isGeneratingVideo ||
												scenesDisabled ||
												!(scene.speaker === "person1"
													? person1ImageUrl
													: person2ImageUrl)
											}
											title={
												!scene.audioBase64
													? "Generate audio first to enable video generation"
													: undefined
											}
											className={`${scene.isGeneratingVideo ? "" : "mt-3"} w-full py-3 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-400 hover:to-violet-400 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 shadow-md shadow-indigo-500/20 hover:shadow-indigo-500/40 disabled:shadow-none flex items-center justify-center gap-2`}
										>
											{scene.isGeneratingVideo ? (
												<>
													<Loader2 className="w-5 h-5 animate-spin" />
													Generating Video...
												</>
											) : (
												<>
													<Film className="w-5 h-5" />
													{scene.videoError ? "RETRY VIDEO" : "GENERATE VIDEO"}
												</>
											)}
										</button>
									</div>
								</div>

								{/* Right side: video preview + audio controls (16:9 landscape) */}
								<div className="w-64 flex-shrink-0">
									{/* Character image preview based on speaker */}
									<div className="relative mb-3">
										{(scene.speaker === "person1" ? person1Image : person2Image) ? (
											<>
												<img
													src={`data:image/jpeg;base64,${scene.speaker === "person1" ? person1Image : person2Image}`}
													alt={`${scene.speaker === "person1" ? "Person 1" : "Person 2"}`}
													className="w-full rounded-lg shadow-lg object-cover opacity-60"
													style={{ aspectRatio: "16/9" }}
												/>
												{/* Caption overlay during playback */}
												{playingSceneId === scene.id &&
													scene.wordTimestamps &&
													currentWordIndex !== null && (
														<div className="absolute inset-0 flex items-center justify-center rounded-lg">
															<p className="text-white text-center text-2xl font-bold px-3 py-2 mx-2 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
																{scene.wordTimestamps[currentWordIndex]?.word ||
																	""}
															</p>
														</div>
													)}
											</>
										) : (
											<div
												className="w-full bg-slate-900/50 border border-slate-600 rounded-lg flex items-center justify-center text-slate-500"
												style={{ aspectRatio: "16/9" }}
											>
												<div className="text-center p-4">
													<ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
													<span className="text-xs">Generate character</span>
												</div>
											</div>
										)}
									</div>

									{/* Duration, play button, and download button */}
									<div className="flex items-center justify-between text-sm">
										<span className="text-slate-400">
											{scene.audioDuration
												? `${scene.audioDuration.toFixed(1)}s`
												: "--"}
										</span>
										{scene.audioBase64 && (
											<div className="flex items-center gap-1">
												<button
													type="button"
													onClick={() => handlePlaySceneAudio(scene.id)}
													disabled={scenesDisabled}
													className={`p-2 rounded-full transition-colors ${
														playingSceneId === scene.id
															? "bg-emerald-500 text-white"
															: "bg-slate-700 text-slate-300 hover:bg-slate-600"
													}`}
													title="Play audio"
												>
													<Play className="w-4 h-4" />
												</button>
												<button
													type="button"
													onClick={() => handleDownloadAudio(scene.id, index)}
													className="p-2 rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
													title="Download audio"
												>
													<Download className="w-4 h-4" />
												</button>
											</div>
										)}
									</div>

									{/* Video preview area (16:9 landscape) */}
									<div className="mt-3">
										{scene.videoBase64 ? (
											<>
												<video
													src={`data:video/mp4;base64,${scene.videoBase64}`}
													controls
													className="w-full rounded-lg shadow-lg"
													style={{ aspectRatio: "16/9" }}
												>
													<track kind="captions" />
													Your browser does not support video playback.
												</video>
												<div className="mt-1 text-xs text-slate-400 text-center">
													Video: {scene.videoDuration?.toFixed(1)}s
												</div>
											</>
										) : (
											<div
												className="w-full bg-slate-900/50 border border-slate-600 rounded-lg flex items-center justify-center text-slate-500"
												style={{ aspectRatio: "16/9" }}
											>
												<div className="text-center p-4">
													<Film className="w-8 h-8 mx-auto mb-2 opacity-50" />
													<span className="text-xs">Video Preview</span>
												</div>
											</div>
										)}
									</div>
								</div>
							</div>
						</div>
					))}

					{/* Add Scene Button */}
					<button
						type="button"
						onClick={() => podcast42Actions.addScene()}
						disabled={scenesDisabled}
						className="w-full py-4 border-2 border-dashed border-slate-600 hover:border-amber-500 rounded-xl text-slate-400 hover:text-amber-400 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<Plus className="w-5 h-5" />
						Add New Scene
					</button>
				</div>
			)}

			{/* Export My Video Button - shown when all scenes have videos */}
			{allScenesHaveVideos && (
				<div className="mt-8">
					<button
						type="button"
						onClick={handleExportMyVideo}
						className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-lg font-bold rounded-xl transition-all duration-300 shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 flex items-center justify-center gap-3"
					>
						<Film className="w-6 h-6" />
						EXPORT MY VIDEO
					</button>
				</div>
			)}
		</div>
	);
}
