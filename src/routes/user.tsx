import type { User as SupabaseUser } from "@supabase/supabase-js";
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
	User,
} from "lucide-react";
import { useState } from "react";
import { StoryCard } from "@/components/story-card";
import { StoryCardSkeleton } from "@/components/story-card-skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { authFetch, useAuth } from "@/hooks/use-auth";
import { useDeleteStory, useListStories } from "@/hooks/use-story-history";
import type { StoryMetadata } from "@/lib/cache";
import { getThumbnailUrl } from "@/lib/image-utils";
import { aistoryActions } from "@/stores/aistory.store";
import { authStore } from "@/stores/auth.store";
import {
	directorActions,
	type DirectorImageEngine,
	type DirectorVideoEngine,
	type DirectorAvatarEngine,
	type DirectorImageStyle,
	type DirectorVoiceId,
} from "@/stores/director.store";
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

// Database scene types (from API response)
interface DbScene {
	id: string;
	orderIndex?: number;
	title?: string;
	prompt?: string;
	videoPrompt?: string;
	isCharacter?: boolean;
	caption: string;
	imageId?: string;
	imageUrl?: string;
	audioId?: string;
	audioUrl?: string;
	audioDuration?: number;
	wordTimestamps?: string | null; // JSON string of word-level timestamps
	videoId?: string;
	videoUrl?: string;
	videoDuration?: number;
	voiceId?: string;
	voiceSpeed?: number | string;
	speaker?: string;
	// Per-scene engine settings (for director-mode)
	imageEngine?: string;
	videoEngine?: string;
	avatarEngine?: string | null;
}

// Type guard for VoiceId
import type { VideoEngine, VoiceId } from "@/stores/aistory.store";

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
			<div className="flex min-h-screen items-center justify-center bg-background">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
			</div>
		);
	}

	if (!isAuthenticated) {
		return (
			<div className="min-h-screen bg-background p-6">
				<div className="mx-auto mt-20 max-w-md text-center">
					<User className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
					<h1 className="mb-4 text-2xl font-bold text-foreground">
						Sign in to continue
					</h1>
					<p className="mb-8 text-muted-foreground">
						Sign in with your Google account to access your profile, history,
						and assets.
					</p>
					<button
						type="button"
						onClick={signInWithGoogle}
						className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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
		<div className="min-h-screen bg-background p-6">
			<div className="mx-auto max-w-5xl">
				{/* Header */}
				<div className="mb-8 flex items-center justify-between">
					<div className="flex items-center gap-4">
						<Link
							to="/"
							className="rounded-lg p-2 text-foreground transition-colors hover:bg-accent"
						>
							<ArrowLeft className="h-6 w-6" />
						</Link>
						<h1 className="text-3xl font-bold text-foreground">My Account</h1>
					</div>
					<ThemeToggle />
				</div>

				{/* Tabs */}
				<div className="mb-8 flex gap-2 border-b border-border pb-2">
					{tabs.map((tab) => (
						<button
							key={tab.id}
							type="button"
							onClick={() => setActiveTab(tab.id)}
							className={`flex items-center gap-2 rounded-lg px-4 py-2 transition-colors ${
								activeTab === tab.id
									? "bg-primary text-primary-foreground"
									: "text-muted-foreground hover:bg-accent hover:text-foreground"
							}`}
						>
							<tab.icon className="h-4 w-4" />
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
function ProfileTab({
	user,
	signOut,
}: {
	user: SupabaseUser | null;
	signOut: () => void;
}) {
	return (
		<div>
			{/* User Info Card */}
			<div className="mb-8 rounded-xl border border-border bg-card p-6">
				<div className="flex items-center gap-4">
					{user?.user_metadata?.avatar_url ? (
						<img
							src={user.user_metadata.avatar_url}
							alt="Avatar"
							className="h-20 w-20 rounded-full"
						/>
					) : (
						<div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary">
							<User size={40} className="text-primary-foreground" />
						</div>
					)}
					<div>
						<h2 className="text-xl font-semibold text-foreground">
							{user?.user_metadata?.full_name || "User"}
						</h2>
						<p className="text-muted-foreground">{user?.email}</p>
					</div>
				</div>
			</div>

			{/* Sign Out */}
			<button
				type="button"
				onClick={signOut}
				className="flex items-center gap-2 rounded-lg px-4 py-2 text-destructive transition-colors hover:bg-destructive/10"
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
	const { data, isLoading } = useListStories();
	const deleteStory = useDeleteStory();
	const [loadingStoryId, setLoadingStoryId] = useState<string | null>(null);

	// AlertDialog state
	const [showDeleteDialog, setShowDeleteDialog] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);

	const handleDelete = (storyId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setDeleteTarget(storyId);
		setShowDeleteDialog(true);
	};

	const confirmDelete = async () => {
		if (!deleteTarget) return;
		setIsDeleting(true);
		try {
			await deleteStory.mutateAsync(deleteTarget);
		} finally {
			setIsDeleting(false);
			setShowDeleteDialog(false);
			setDeleteTarget(null);
		}
	};

	const handleResume = async (story: StoryMetadata) => {
		const storyId = story.storyId;
		if (!storyId) {
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
				console.error("Failed to load story data");
				return;
			}

			const storyData = result.story;
			const scenes = result.scenes || [];
			const characterImages = result.characterImages || {};

			if (storyData.type === "director-mode") {
				// Restore director-mode state
				directorActions.reset();

				// Set basic info
				directorActions.setStoryId(storyData.id);
				directorActions.setTitle(storyData.title || "");

				// Restore default engines from story-level
				directorActions.setDefaultImageEngine(
					(storyData.imageEngine || "flux-pro") as DirectorImageEngine,
				);
				directorActions.setDefaultImageStyle(
					(storyData.imageStyle || "cinematic") as DirectorImageStyle,
				);
				directorActions.setDefaultVideoEngine(
					(storyData.videoEngine || "kling-video") as DirectorVideoEngine,
				);
				if (storyData.voiceId) {
					directorActions.setDefaultVoiceId(storyData.voiceId as DirectorVoiceId);
				}

				// Restore character from characterImages
				if (characterImages.character) {
					directorActions.setCharacter({
						id: "character",
						name: "Main Character",
						imagePrompt: storyData.characterPrompt || "",
						imageUrl: characterImages.character.imageUrl,
						imageId: characterImages.character.imageId,
						imageSource: "generate",
						imageEngine: (storyData.imageEngine || "flux-pro") as DirectorImageEngine,
						voiceId: (storyData.voiceId || "PIGsltMj3gFMR34aFDI3") as DirectorVoiceId,
						voiceSpeed: 1.0,
						videoEngine: (storyData.videoEngine || "kling-video") as DirectorVideoEngine,
						isGenerating: false,
						imageStatus: "completed",
					});
				}

				// Restore scenes with per-scene engines
				const restoredScenes = scenes.map((scene: DbScene, index: number) => {
					// Parse wordTimestamps from JSON string
					let wordTimestamps = null;
					if (scene.wordTimestamps) {
						try {
							const parsed = JSON.parse(scene.wordTimestamps);
							wordTimestamps = parsed.map(
								(wt: { word: string; start?: number; end?: number; startTime?: number; endTime?: number }) => ({
									word: wt.word,
									startTime: wt.startTime ?? wt.start ?? 0,
									endTime: wt.endTime ?? wt.end ?? 0,
								}),
							);
						} catch {
							wordTimestamps = null;
						}
					}

					return {
						id: scene.id,
						orderIndex: scene.orderIndex ?? index,
						caption: scene.caption || "",
						imagePrompt: scene.prompt || "",
						videoPrompt: scene.videoPrompt || "",
						imageId: scene.imageId || null,
						imageUrl: scene.imageUrl || null,
						audioId: scene.audioId || null,
						audioUrl: scene.audioUrl || null,
						videoId: scene.videoId || null,
						videoUrl: scene.videoUrl || null,
						imageStatus: scene.imageUrl ? "completed" as const : null,
						audioStatus: scene.audioUrl ? "completed" as const : null,
						videoStatus: scene.videoUrl ? "completed" as const : null,
						audioDuration: scene.audioDuration || null,
						videoDuration: scene.videoDuration || null,
						wordTimestamps,
						// Per-scene engines (fall back to story defaults)
						imageEngine: (scene.imageEngine || storyData.imageEngine || "flux-pro") as DirectorImageEngine,
						voiceId: (scene.voiceId || storyData.voiceId || "PIGsltMj3gFMR34aFDI3") as DirectorVoiceId,
						voiceSpeed: Number(scene.voiceSpeed) || 1.0,
						videoEngine: (scene.videoEngine || storyData.videoEngine || "kling-video") as DirectorVideoEngine,
						avatarEngine: (scene.avatarEngine || "omnihuman") as DirectorAvatarEngine | null,
						useAvatar: !!scene.avatarEngine,
						isGeneratingImage: false,
						isGeneratingAudio: false,
						isGeneratingVideo: false,
						videoError: null,
					};
				});
				directorActions.setScenes(restoredScenes);
				directorActions.setPromptsGenerated(true);

				// Restore exported video URL if available
				if (storyData.exportVideoUrl) {
					directorActions.setExportedVideoUrl(storyData.exportVideoUrl);
				}

				// Navigate to scenes page
				navigate({ to: "/director-mode/scenes" });
			} else if (storyData.type === "podcast42") {
				// Restore podcast42 state
				podcast42Actions.reset();
				podcast42Actions.setStoryId(storyData.id);
				podcast42Actions.setPlayScript(storyData.playScript || "");
				podcast42Actions.setPerson1Prompt(storyData.person1Prompt || null);
				podcast42Actions.setPerson2Prompt(storyData.person2Prompt || null);
				podcast42Actions.setImageEngine(storyData.imageEngine);
				podcast42Actions.setImageStyle(storyData.imageStyle);

				if (storyData.person1VoiceId) {
					podcast42Actions.setPerson1VoiceId(
						storyData.person1VoiceId as VoiceId,
					);
				}
				if (storyData.person2VoiceId) {
					podcast42Actions.setPerson2VoiceId(
						storyData.person2VoiceId as VoiceId,
					);
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
				const restoredScenes = scenes.map((scene: DbScene) => ({
					id: scene.id,
					speaker: (scene.speaker || "person1") as "person1" | "person2",
					caption: scene.caption,
					audioId: scene.audioId,
					audioUrl: scene.audioUrl,
					audioDuration: scene.audioDuration,
					videoId: scene.videoId,
					videoUrl: scene.videoUrl,
					videoDuration: scene.videoDuration,
				}));
				podcast42Actions.setScenes(restoredScenes);
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
					aistoryActions.setVideoEngine(storyData.videoEngine as VideoEngine);
				}

				// Restore character image from characterImages (URL-based)
				if (characterImages.character) {
					aistoryActions.setCharacterImageId(characterImages.character.imageId);
					aistoryActions.setCharacterImageUrl(
						characterImages.character.imageUrl,
					);
				}

				// Restore scenes with URL-based media and per-scene voice settings
				const restoredScenes = scenes.map((scene: DbScene) => {
					// Parse wordTimestamps from JSON string and normalize field names
					// Backend uses { word, start, end }, frontend expects { word, startTime, endTime }
					let wordTimestamps;
					if (scene.wordTimestamps) {
						try {
							const parsed = JSON.parse(scene.wordTimestamps);
							// Normalize to frontend format
							wordTimestamps = parsed.map(
								(wt: { word: string; start?: number; end?: number; startTime?: number; endTime?: number }) => ({
									word: wt.word,
									startTime: wt.startTime ?? wt.start ?? 0,
									endTime: wt.endTime ?? wt.end ?? 0,
								}),
							);
						} catch {
							wordTimestamps = undefined;
						}
					}
					return {
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
						wordTimestamps,
						videoId: scene.videoId,
						videoUrl: scene.videoUrl,
						videoDuration: scene.videoDuration,
						// Per-scene voice settings
						voiceId: scene.voiceId as VoiceId | undefined,
						// Ensure voiceSpeed is a number (may come as string from database)
						voiceSpeed: Number(scene.voiceSpeed) || 1.0,
					};
				});
				aistoryActions.setScenes(restoredScenes);
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

	// Loading state with skeletons
	if (isLoading) {
		return (
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 6 }).map((_, i) => (
					<StoryCardSkeleton key={i} />
				))}
			</div>
		);
	}

	// Empty state
	if (!data?.stories || data.stories.length === 0) {
		return (
			<div className="py-12 text-center text-muted-foreground">
				<Clock className="mx-auto mb-4 h-12 w-12 opacity-50" />
				<p className="mb-4 text-xl">No stories yet</p>
				<p>Create your first AI Story or Podcast to see it here.</p>
			</div>
		);
	}

	return (
		<>
			{/* Gallery Grid */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{data.stories.map((story) => (
					<StoryCard
						key={story.storyId}
						story={story}
						onResume={handleResume}
						onDelete={handleDelete}
						isLoading={loadingStoryId === story.storyId}
					/>
				))}
			</div>

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Story</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete this story? This action cannot be
							undone. All scenes, images, audio, and video associated with this
							story will be permanently removed.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmDelete}
							disabled={isDeleting}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{isDeleting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Deleting...
								</>
							) : (
								"Delete"
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
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
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
				<span className="ml-3 text-muted-foreground">Loading assets...</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-destructive">
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
			<div className="py-20 text-center text-muted-foreground">
				<div className="mb-4 flex justify-center gap-4">
					<ImageIcon className="h-12 w-12 opacity-50" />
					<Film className="h-12 w-12 opacity-50" />
				</div>
				<p className="text-lg">Your asset library is empty</p>
				<p className="mt-2 text-sm">
					When you regenerate images or videos, the old ones will appear here
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-10">
			{/* Images Section */}
			<section>
				<h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-foreground">
					<ImageIcon className="h-5 w-5 text-purple-500" />
					Images ({data.images?.length || 0})
				</h2>

				{data.images && data.images.length > 0 ? (
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
						{data.images.map((image) => (
							<div
								key={image.id}
								className="overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-purple-500/50"
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
										className="flex w-full items-center justify-center bg-muted text-muted-foreground"
										style={{ aspectRatio: "9/16" }}
									>
										<ImageIcon className="h-8 w-8" />
									</div>
								)}
								<div className="p-3">
									<p className="mb-1 text-xs text-muted-foreground">
										{formatDate(image.createdAt)}
									</p>
									<p
										className="line-clamp-2 text-sm text-foreground"
										title={image.prompt}
									>
										{truncatePrompt(image.prompt)}
									</p>
									<div className="mt-2 flex items-center gap-2">
										<span className="inline-block rounded bg-purple-500/20 px-2 py-0.5 text-xs text-purple-500">
											{image.imageType}
										</span>
										{image.storyId ? (
											<span className="inline-flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 text-xs text-primary">
												<LinkIcon className="h-3 w-3" />
												linked
											</span>
										) : (
											<span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
												orphaned
											</span>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="py-10 text-center text-muted-foreground">
						<ImageIcon className="mx-auto mb-3 h-12 w-12 opacity-50" />
						<p>No images yet</p>
						<p className="mt-1 text-sm">Create a story to generate images</p>
					</div>
				)}
			</section>

			{/* Videos Section */}
			<section>
				<h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-foreground">
					<Film className="h-5 w-5 text-indigo-500" />
					Videos ({data.videos?.length || 0})
				</h2>

				{data.videos && data.videos.length > 0 ? (
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
						{data.videos.map((video) => (
							<div
								key={video.id}
								className="overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-indigo-500/50"
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
										className="flex w-full items-center justify-center bg-muted text-muted-foreground"
										style={{ aspectRatio: "9/16" }}
									>
										<Film className="h-8 w-8" />
									</div>
								)}
								<div className="p-3">
									<div className="mb-1 flex items-center justify-between">
										<p className="text-xs text-muted-foreground">
											{formatDate(video.createdAt)}
										</p>
										{video.duration && (
											<span className="text-xs text-indigo-500">
												{video.duration.toFixed(1)}s
											</span>
										)}
									</div>
									<p
										className="line-clamp-2 text-sm text-foreground"
										title={video.prompt}
									>
										{truncatePrompt(video.prompt)}
									</p>
									<div className="mt-2">
										{video.storyId ? (
											<span className="inline-flex items-center gap-1 rounded bg-primary/20 px-2 py-0.5 text-xs text-primary">
												<LinkIcon className="h-3 w-3" />
												linked
											</span>
										) : (
											<span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
												orphaned
											</span>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="py-10 text-center text-muted-foreground">
						<Film className="mx-auto mb-3 h-12 w-12 opacity-50" />
						<p>No videos yet</p>
						<p className="mt-1 text-sm">Create a story to generate videos</p>
					</div>
				)}
			</section>
		</div>
	);
}
