import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import {
	ArrowLeft,
	Clock,
	Film,
	FolderOpen,
	ImageIcon,
	Link as LinkIcon,
	Loader2,
	LogOut,
	Mic,
	Play,
	Sparkles,
	Trash2,
	User,
} from "lucide-react";
import { useState } from "react";
import { authFetch, useAuth } from "@/hooks/use-auth";
import { useDeleteStory, useListStories } from "@/hooks/use-story-history";
import type { StoryMetadata } from "@/lib/cache";
import { getThumbnailUrl } from "@/lib/image-utils";
import { authStore } from "@/stores/auth.store";
import { aistoryActions } from "@/stores/aistory.store";
import { podcast42Actions } from "@/stores/podcast42.store";

// Asset types
interface AssetImage {
	id: string;
	imageUrl: string | null;
	prompt: string;
	imageType: string;
	storyId: string | null;
	createdAt: string | null;
}

interface AssetVideo {
	id: string;
	videoUrl: string | null;
	prompt: string;
	duration: number | null;
	storyId: string | null;
	createdAt: string | null;
}

interface AssetLibraryResponse {
	success: boolean;
	images?: AssetImage[];
	videos?: AssetVideo[];
	error?: string;
}

async function fetchAssetLibrary(): Promise<AssetLibraryResponse> {
	const response = await authFetch("/api/asset-library");
	return response.json();
}

type TabType = "profile" | "history" | "assets";

// Search params for URL-based tab selection
interface UserSearchParams {
	tab?: TabType;
}

export const Route = createFileRoute("/user")({
	validateSearch: (search: Record<string, unknown>): UserSearchParams => {
		const tab = search.tab as string | undefined;
		if (tab === "history" || tab === "assets" || tab === "profile") {
			return { tab };
		}
		return {};
	},
	component: UserPage,
});

function UserPage() {
	const { user, isAuthenticated, isLoading } = useStore(authStore);
	const { signOut, signInWithGoogle } = useAuth();
	const { tab: urlTab } = Route.useSearch();
	const [activeTab, setActiveTab] = useState<TabType>(urlTab || "profile");

	if (isLoading) {
		return (
			<div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
				<div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
			</div>
		);
	}

	if (!isAuthenticated) {
		return (
			<div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-6">
				<div className="max-w-md mx-auto text-center mt-20">
					<User className="w-16 h-16 text-gray-500 mx-auto mb-4" />
					<h1 className="text-2xl font-bold text-white mb-4">
						Sign in to continue
					</h1>
					<p className="text-gray-400 mb-8">
						Sign in with your Google account to access your profile, history,
						and assets.
					</p>
					<button
						type="button"
						onClick={signInWithGoogle}
						className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors"
					>
						Sign in with Google
					</button>
				</div>
			</div>
		);
	}

	const tabs = [
		{ id: "profile" as const, label: "Profile", icon: User },
		{ id: "history" as const, label: "History", icon: Clock },
		{ id: "assets" as const, label: "Assets", icon: FolderOpen },
	];

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
					<h1 className="text-3xl font-bold text-white">My Account</h1>
				</div>

				{/* Tabs */}
				<div className="flex gap-2 mb-8 border-b border-slate-700 pb-2">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
								activeTab === tab.id
									? "bg-cyan-600 text-white"
									: "text-slate-400 hover:bg-slate-700 hover:text-white"
							}`}
						>
							<tab.icon className="w-4 h-4" />
							{tab.label}
						</button>
					))}
				</div>

				{/* Tab Content */}
				{activeTab === "profile" && (
					<ProfileTab user={user} signOut={signOut} />
				)}
				{activeTab === "history" && <HistoryTab />}
				{activeTab === "assets" && <AssetsTab />}
			</div>
		</div>
	);
}

// Profile Tab Component
function ProfileTab({ user, signOut }: { user: any; signOut: () => void }) {
	return (
		<div>
			{/* User Info Card */}
			<div className="bg-slate-800/50 rounded-xl p-6 mb-8 border border-slate-700">
				<div className="flex items-center gap-4">
					{user?.user_metadata?.avatar_url ? (
						<img
							src={user.user_metadata.avatar_url}
							alt="Avatar"
							className="w-20 h-20 rounded-full"
						/>
					) : (
						<div className="w-20 h-20 bg-cyan-600 rounded-full flex items-center justify-center">
							<User size={40} className="text-white" />
						</div>
					)}
					<div>
						<h2 className="text-xl font-semibold text-white">
							{user?.user_metadata?.full_name || "User"}
						</h2>
						<p className="text-slate-400">{user?.email}</p>
					</div>
				</div>
			</div>

			{/* Sign Out */}
			<button
				type="button"
				onClick={signOut}
				className="flex items-center gap-2 px-4 py-2 text-red-400 hover:bg-slate-700/50 rounded-lg transition-colors"
			>
				<LogOut size={20} />
				Sign Out
			</button>
		</div>
	);
}

// History Tab Component
function HistoryTab() {
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
		const storyId = story.storyId;
		if (!storyId) {
			alert("Invalid story: missing storyId");
			console.error("Story missing storyId:", story);
			return;
		}
		setLoadingStoryId(storyId);

		try {
			// Fetch full story data from new API
			const response = await authFetch(
				`/api/story-metadata?storyId=${storyId}`,
			);
			const result = await response.json();

			if (!result.success || !result.story) {
				alert("Failed to load story data");
				return;
			}

			const storyData = result.story;
			const scenes = result.scenes || [];
			const characterImages = result.characterImages || {};

			if (storyData.type === "podcast42") {
				// Restore podcast42 state
				podcast42Actions.reset();
				podcast42Actions.setStoryId(storyData.id);
				podcast42Actions.setPlayScript(storyData.playScript || "");
				podcast42Actions.setPerson1Prompt(storyData.person1Prompt || null);
				podcast42Actions.setPerson2Prompt(storyData.person2Prompt || null);
				podcast42Actions.setImageEngine(storyData.imageEngine);
				podcast42Actions.setImageStyle(storyData.imageStyle);

				if (storyData.person1VoiceId) {
					podcast42Actions.setPerson1VoiceId(storyData.person1VoiceId as any);
				}
				if (storyData.person2VoiceId) {
					podcast42Actions.setPerson2VoiceId(storyData.person2VoiceId as any);
				}

				// Restore person images from characterImages (URL-based)
				if (characterImages.person1) {
					podcast42Actions.setPerson1ImageId(characterImages.person1.imageId);
					podcast42Actions.setPerson1ImageUrl(characterImages.person1.imageUrl);
				}
				if (characterImages.person2) {
					podcast42Actions.setPerson2ImageId(characterImages.person2.imageId);
					podcast42Actions.setPerson2ImageUrl(characterImages.person2.imageUrl);
				}

				// Restore scenes with URL-based media
				const restoredScenes = scenes.map((scene: any) => ({
					id: scene.id,
					speaker: scene.speaker || "person1",
					caption: scene.caption,
					audioId: scene.audioId,
					audioUrl: scene.audioUrl,
					audioDuration: scene.audioDuration,
					videoId: scene.videoId,
					videoUrl: scene.videoUrl,
					videoDuration: scene.videoDuration,
				}));
				podcast42Actions.setScenes(restoredScenes as any);
				podcast42Actions.setPromptsGenerated(true);

				// Always navigate to scenes page for podcast42
				navigate({ to: "/podcast42/scenes" });
			} else {
				// Restore aistory state
				aistoryActions.reset();
				aistoryActions.setStoryId(storyData.id);
				aistoryActions.setScript(storyData.script || "");
				aistoryActions.setCharacterPrompt(storyData.characterPrompt || "");
				aistoryActions.setImageEngine(storyData.imageEngine);
				aistoryActions.setImageStyle(storyData.imageStyle);

				// Note: voiceId is now per-scene, stored in scene data
				if (storyData.videoEngine) {
					aistoryActions.setVideoEngine(storyData.videoEngine as any);
				}

				// Restore character image from characterImages (URL-based)
				if (characterImages.character) {
					aistoryActions.setCharacterImageId(characterImages.character.imageId);
					aistoryActions.setCharacterImageUrl(
						characterImages.character.imageUrl,
					);
				}

				// Restore scenes with URL-based media and per-scene voice settings
				const restoredScenes = scenes.map((scene: any) => ({
					id: scene.id,
					title: scene.title || "Untitled",
					prompt: scene.prompt || "",
					video_prompt: scene.videoPrompt || "",
					isCharacter: scene.isCharacter ?? true,
					caption: scene.caption,
					imageId: scene.imageId,
					imageUrl: scene.imageUrl,
					audioId: scene.audioId,
					audioUrl: scene.audioUrl,
					audioDuration: scene.audioDuration,
					videoId: scene.videoId,
					videoUrl: scene.videoUrl,
					videoDuration: scene.videoDuration,
					// Per-scene voice settings
					voiceId: scene.voiceId,
					voiceSpeed: scene.voiceSpeed ?? 1.0,
				}));
				aistoryActions.setScenes(restoredScenes as any);
				aistoryActions.setPromptsGenerated(true);

				// Restore exported video URL if available
				if (storyData.exportVideoUrl) {
					aistoryActions.setExportedVideoUrl(storyData.exportVideoUrl);
				}

				// Always navigate to scenes page (export is now shown in scenes page)
				navigate({ to: "/aistory/scenes" });
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
		const scenes = story.scenes || [];
		const total = scenes.length;
		const withAudio = scenes.filter((s) => s.hasAudio).length;
		const withVideo = scenes.filter((s) => s.hasVideo).length;
		return { total, withAudio, withVideo };
	};

	if (isLoading) {
		return (
			<div className="text-center text-slate-400 py-12">Loading stories...</div>
		);
	}

	if (!data?.stories || data.stories.length === 0) {
		return (
			<div className="text-center text-slate-400 py-12">
				<Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
				<p className="text-xl mb-4">No stories yet</p>
				<p>Create your first AI Story or Podcast to see it here.</p>
			</div>
		);
	}

	return (
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
	);
}

// Assets Tab Component
function AssetsTab() {
	const { data, isLoading, error } = useQuery({
		queryKey: ["asset-library"],
		queryFn: fetchAssetLibrary,
	});

	const formatDate = (dateString: string | null) => {
		if (!dateString) return "Unknown date";
		return new Date(dateString).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	const truncatePrompt = (prompt: string, maxLength = 80) => {
		if (prompt.length <= maxLength) return prompt;
		return `${prompt.slice(0, maxLength)}...`;
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-20">
				<Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
				<span className="ml-3 text-slate-400">Loading assets...</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-300">
				Failed to load asset library: {error.message}
			</div>
		);
	}

	if (
		!data?.success ||
		((!data.images || data.images.length === 0) &&
			(!data.videos || data.videos.length === 0))
	) {
		return (
			<div className="text-center py-20 text-slate-500">
				<div className="flex justify-center gap-4 mb-4">
					<ImageIcon className="w-12 h-12 opacity-50" />
					<Film className="w-12 h-12 opacity-50" />
				</div>
				<p className="text-lg">Your asset library is empty</p>
				<p className="text-sm mt-2">
					When you regenerate images or videos, the old ones will appear here
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-10">
			{/* Images Section */}
			<section>
				<h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
					<ImageIcon className="w-5 h-5 text-purple-400" />
					Images ({data.images?.length || 0})
				</h2>

				{data.images && data.images.length > 0 ? (
					<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
						{data.images.map((image) => (
							<div
								key={image.id}
								className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden hover:border-purple-500/50 transition-colors"
							>
								{image.imageUrl ? (
									<img
										src={getThumbnailUrl(image.imageUrl, 300)}
										alt={image.prompt}
										className="w-full object-cover"
										style={{ aspectRatio: "9/16" }}
										loading="lazy"
									/>
								) : (
									<div
										className="w-full bg-slate-900 flex items-center justify-center text-slate-600"
										style={{ aspectRatio: "9/16" }}
									>
										<ImageIcon className="w-8 h-8" />
									</div>
								)}
								<div className="p-3">
									<p className="text-xs text-slate-400 mb-1">
										{formatDate(image.createdAt)}
									</p>
									<p
										className="text-sm text-slate-300 line-clamp-2"
										title={image.prompt}
									>
										{truncatePrompt(image.prompt)}
									</p>
									<div className="mt-2 flex items-center gap-2">
										<span className="inline-block text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
											{image.imageType}
										</span>
										{image.storyId ? (
											<span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded">
												<LinkIcon className="w-3 h-3" />
												linked
											</span>
										) : (
											<span className="text-xs px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded">
												orphaned
											</span>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="text-center py-10 text-slate-500">
						<ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
						<p>No images yet</p>
						<p className="text-sm mt-1">Create a story to generate images</p>
					</div>
				)}
			</section>

			{/* Videos Section */}
			<section>
				<h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
					<Film className="w-5 h-5 text-indigo-400" />
					Videos ({data.videos?.length || 0})
				</h2>

				{data.videos && data.videos.length > 0 ? (
					<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
						{data.videos.map((video) => (
							<div
								key={video.id}
								className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden hover:border-indigo-500/50 transition-colors"
							>
								{video.videoUrl ? (
									<video
										src={video.videoUrl}
										className="w-full object-cover"
										style={{ aspectRatio: "9/16" }}
										controls
										preload="metadata"
									>
										<track kind="captions" />
									</video>
								) : (
									<div
										className="w-full bg-slate-900 flex items-center justify-center text-slate-600"
										style={{ aspectRatio: "9/16" }}
									>
										<Film className="w-8 h-8" />
									</div>
								)}
								<div className="p-3">
									<div className="flex items-center justify-between mb-1">
										<p className="text-xs text-slate-400">
											{formatDate(video.createdAt)}
										</p>
										{video.duration && (
											<span className="text-xs text-indigo-400">
												{video.duration.toFixed(1)}s
											</span>
										)}
									</div>
									<p
										className="text-sm text-slate-300 line-clamp-2"
										title={video.prompt}
									>
										{truncatePrompt(video.prompt)}
									</p>
									<div className="mt-2">
										{video.storyId ? (
											<span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded">
												<LinkIcon className="w-3 h-3" />
												linked
											</span>
										) : (
											<span className="text-xs px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded">
												orphaned
											</span>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="text-center py-10 text-slate-500">
						<Film className="w-12 h-12 mx-auto mb-3 opacity-50" />
						<p>No videos yet</p>
						<p className="text-sm mt-1">Create a story to generate videos</p>
					</div>
				)}
			</section>
		</div>
	);
}
