import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ArrowLeft,
	Clock,
	Film,
	Mic,
	Play,
	Sparkles,
	Trash2,
} from "lucide-react";
import {
	useListStories,
	useDeleteStory,
} from "@/hooks/use-story-history";
import type { StoryMetadata } from "@/lib/cache";
import { podcast42Actions } from "@/stores/podcast42.store";
import { aistoryActions } from "@/stores/aistory.store";
import { useState } from "react";

export const Route = createFileRoute("/history")({
	component: HistoryPage,
});

function HistoryPage() {
	const navigate = useNavigate();
	const { data, isLoading, refetch } = useListStories();
	const deleteStory = useDeleteStory();
	const [loadingStoryId, setLoadingStoryId] = useState<string | null>(null);

	const handleDelete = async (storyId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		if (confirm("Are you sure you want to delete this story?")) {
			await deleteStory.mutateAsync(storyId);
			refetch();
		}
	};

	const handleResume = async (story: StoryMetadata) => {
		setLoadingStoryId(story.storyId);

		try {
			// Fetch full story data with files
			const response = await fetch(
				`/api/story-metadata?storyId=${story.storyId}`,
			);
			const result = await response.json();

			if (!result.success || !result.metadata) {
				alert("Failed to load story data");
				return;
			}

			const metadata = result.metadata as StoryMetadata;
			const files = result.files || {};

			if (metadata.type === "podcast42") {
				// Restore podcast42 state
				podcast42Actions.reset();
				podcast42Actions.setStoryId(metadata.storyId);
				podcast42Actions.setPlayScript(metadata.playScript || "");
				podcast42Actions.setPerson1Prompt(metadata.person1Prompt || null);
				podcast42Actions.setPerson2Prompt(metadata.person2Prompt || null);
				podcast42Actions.setImageEngine(metadata.imageEngine);
				podcast42Actions.setImageStyle(metadata.imageStyle);

				if (metadata.person1VoiceId) {
					podcast42Actions.setPerson1VoiceId(metadata.person1VoiceId as any);
				}
				if (metadata.person2VoiceId) {
					podcast42Actions.setPerson2VoiceId(metadata.person2VoiceId as any);
				}

				// Restore person images
				if (files.person1ImageBase64) {
					podcast42Actions.setPerson1Image(files.person1ImageBase64);
					podcast42Actions.setPerson1ImageUrl(metadata.person1ImageUrl || null);
				}
				if (files.person2ImageBase64) {
					podcast42Actions.setPerson2Image(files.person2ImageBase64);
					podcast42Actions.setPerson2ImageUrl(metadata.person2ImageUrl || null);
				}

				// Restore scenes
				const restoredScenes = metadata.scenes.map((scene, index) => ({
					id: scene.id || `scene-${index}`,
					speaker: scene.speaker || "person1",
					caption: scene.caption,
					audioBase64: files.sceneAudios?.[index] || undefined,
					audioDuration: scene.audioDuration,
					wordTimestamps: scene.wordTimestamps?.map((wt) => ({
						word: wt.word,
						startTime: wt.start,
						endTime: wt.end,
					})),
					videoBase64: files.sceneVideos?.[index] || undefined,
					videoDuration: scene.videoDuration,
				}));
				podcast42Actions.setScenes(restoredScenes as any);
				podcast42Actions.setPromptsGenerated(true);

				// Navigate to appropriate page
				const hasAllVideos = restoredScenes.every((s) => s.videoBase64);
				if (hasAllVideos && metadata.hasExportedVideo) {
					navigate({ to: "/podcast42/export" });
				} else {
					navigate({ to: "/podcast42/scenes" });
				}
			} else {
				// Restore aistory state
				aistoryActions.reset();
				aistoryActions.setStoryId(metadata.storyId);
				aistoryActions.setScript(metadata.script || "");
				aistoryActions.setCharacterPrompt(metadata.characterPrompt || "");
				aistoryActions.setImageEngine(metadata.imageEngine);
				aistoryActions.setImageStyle(metadata.imageStyle);

				if (metadata.voiceId) {
					aistoryActions.setVoiceId(metadata.voiceId as any);
				}
				if (metadata.videoEngine) {
					aistoryActions.setVideoEngine(metadata.videoEngine as any);
				}

				// Restore character image
				if (files.characterImageBase64) {
					aistoryActions.setCharacterImage(files.characterImageBase64);
					aistoryActions.setCharacterFileId(metadata.characterFileId || null);
					aistoryActions.setCharacterImageUrl(
						metadata.characterImageUrl || null,
					);
				}

				// Restore scenes
				const restoredScenes = metadata.scenes.map((scene, index) => ({
					id: scene.id || `scene-${index}`,
					title: scene.title || `Scene ${index + 1}`,
					prompt: scene.prompt || "",
					video_prompt: scene.video_prompt || "",
					isCharacter: scene.isCharacter ?? true,
					caption: scene.caption,
					imageBase64: files.sceneImages?.[index] || undefined,
					audioBase64: files.sceneAudios?.[index] || undefined,
					audioDuration: scene.audioDuration,
					wordTimestamps: scene.wordTimestamps?.map((wt) => ({
						word: wt.word,
						startTime: wt.start,
						endTime: wt.end,
					})),
					videoBase64: files.sceneVideos?.[index] || undefined,
					videoDuration: scene.videoDuration,
				}));
				aistoryActions.setScenes(restoredScenes as any);
				aistoryActions.setPromptsGenerated(true);

				// Navigate to appropriate page
				const hasAllVideos = restoredScenes.every((s) => s.videoBase64);
				if (hasAllVideos && metadata.hasExportedVideo) {
					navigate({ to: "/aistory/export" });
				} else {
					navigate({ to: "/aistory/scenes" });
				}
			}
		} finally {
			setLoadingStoryId(null);
		}
	};

	const formatDate = (dateString: string) => {
		const date = new Date(dateString);
		return date.toLocaleDateString() + " " + date.toLocaleTimeString();
	};

	const getProgress = (story: StoryMetadata) => {
		const total = story.scenes.length;
		const withAudio = story.scenes.filter((s) => s.hasAudio).length;
		const withVideo = story.scenes.filter((s) => s.hasVideo).length;
		return { total, withAudio, withVideo };
	};

	return (
		<div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
			<div className="max-w-4xl mx-auto">
				{/* Header */}
				<div className="flex items-center gap-4 mb-8">
					<Link
						to="/"
						className="p-2 text-white hover:bg-slate-700 rounded-lg transition-colors"
					>
						<ArrowLeft className="w-6 h-6" />
					</Link>
					<h1 className="text-3xl font-bold text-white flex items-center gap-3">
						<Clock className="w-8 h-8" />
						History
					</h1>
				</div>

				{/* Loading state */}
				{isLoading && (
					<div className="text-center text-slate-400 py-12">
						Loading stories...
					</div>
				)}

				{/* Empty state */}
				{!isLoading && (!data?.stories || data.stories.length === 0) && (
					<div className="text-center text-slate-400 py-12">
						<p className="text-xl mb-4">No stories yet</p>
						<p>Create your first AI Story or Podcast to see it here.</p>
					</div>
				)}

				{/* Stories list */}
				{data?.stories && data.stories.length > 0 && (
					<div className="space-y-4">
						{data.stories.map((story) => {
							const progress = getProgress(story);
							const isPodcast = story.type === "podcast42";

							return (
								<div
									key={story.storyId}
									className="bg-slate-800/50 rounded-xl p-4 hover:bg-slate-700/50 transition-colors cursor-pointer border border-slate-700"
									onClick={() => handleResume(story)}
								>
									<div className="flex items-start justify-between">
										<div className="flex-1">
											{/* Type badge */}
											<div className="flex items-center gap-2 mb-2">
												{isPodcast ? (
													<span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-500/20 text-amber-400 rounded-full text-xs">
														<Mic className="w-3 h-3" />
														Podcast 42
													</span>
												) : (
													<span className="inline-flex items-center gap-1 px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-xs">
														<Sparkles className="w-3 h-3" />
														AI Story
													</span>
												)}
												<span className="text-slate-500 text-xs">
													{story.imageStyle} • {story.imageEngine}
												</span>
											</div>

											{/* Story ID and date */}
											<h3 className="text-white font-medium mb-1 truncate">
												{story.storyId}
											</h3>
											<p className="text-slate-400 text-sm mb-2">
												Updated: {formatDate(story.updatedAt)}
											</p>

											{/* Progress */}
											<div className="flex items-center gap-4 text-sm">
												<span className="text-slate-400">
													{progress.total} scenes
												</span>
												<span className="text-blue-400 flex items-center gap-1">
													<Play className="w-3 h-3" />
													{progress.withAudio} audio
												</span>
												<span className="text-green-400 flex items-center gap-1">
													<Film className="w-3 h-3" />
													{progress.withVideo} video
												</span>
												{story.hasExportedVideo && (
													<span className="text-purple-400">Exported</span>
												)}
											</div>
										</div>

										{/* Actions */}
										<div className="flex items-center gap-2 ml-4">
											{loadingStoryId === story.storyId ? (
												<div className="w-8 h-8 animate-spin rounded-full border-2 border-slate-500 border-t-white" />
											) : (
												<>
													<button
														type="button"
														className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
														onClick={(e) => handleDelete(story.storyId, e)}
													>
														<Trash2 className="w-5 h-5" />
													</button>
													<button
														type="button"
														className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
													>
														<Play className="w-5 h-5" />
													</button>
												</>
											)}
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
