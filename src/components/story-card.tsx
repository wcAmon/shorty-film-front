import {
	Clapperboard,
	Download,
	Film,
	ImageIcon,
	Mic,
	MoreHorizontal,
	Play,
	Sparkles,
	Trash2,
	Video,
	Volume2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { StoryMetadata } from "@/lib/cache";
import { cn } from "@/lib/utils";

interface StoryCardProps {
	story: StoryMetadata;
	onResume: (story: StoryMetadata) => void;
	onDelete: (storyId: string, e: React.MouseEvent) => void;
	isLoading?: boolean;
}

// Helper function to get type badge config
function getTypeBadgeConfig(type: string) {
	switch (type) {
		case "podcast42":
			return {
				label: "Podcast",
				Icon: Mic,
				className: "bg-blue-500/20 text-blue-400 border-blue-500/30",
			};
		case "director-mode":
			return {
				label: "Director",
				Icon: Clapperboard,
				className: "bg-purple-500/20 text-purple-400 border-purple-500/30",
			};
		default: // aistory
			return {
				label: "Story",
				Icon: Sparkles,
				className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
			};
	}
}

export function StoryCard({
	story,
	onResume,
	onDelete,
	isLoading,
}: StoryCardProps) {
	const isPodcast = story.type === "podcast42";
	const isDirector = story.type === "director-mode";
	const typeBadge = getTypeBadgeConfig(story.type);
	const progress = getProgress(story);

	// Get thumbnail from first scene image or character image
	const thumbnailUrl =
		story.scenes?.find((s) => s.imageUrl)?.imageUrl ||
		story.characterImageUrl ||
		story.person1ImageUrl;

	return (
		<Card
			className={cn(
				"group relative cursor-pointer overflow-hidden transition-all duration-200",
				"border-border/40 hover:border-border hover:shadow-md",
				"bg-card hover:bg-accent/5",
			)}
			onClick={() => onResume(story)}
		>
			{/* Thumbnail / Cover Image */}
			<div className="aspect-[16/9] bg-muted relative overflow-hidden">
				{thumbnailUrl ? (
					<img
						src={thumbnailUrl}
						alt=""
						className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
						loading="lazy"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
						{isPodcast ? (
							<Mic className="h-12 w-12 text-muted-foreground/30" />
						) : isDirector ? (
							<Clapperboard className="h-12 w-12 text-muted-foreground/30" />
						) : (
							<Film className="h-12 w-12 text-muted-foreground/30" />
						)}
					</div>
				)}

				{/* Hover Actions Overlay */}
				<div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
					<Button variant="secondary" size="sm" className="gap-2">
						<Play className="h-4 w-4" />
						{isLoading ? "Loading..." : "Resume"}
					</Button>
				</div>

				{/* Type Badge */}
				<Badge
					variant="outline"
					className={cn("absolute left-2 top-2", typeBadge.className)}
				>
					<typeBadge.Icon className="mr-1 h-3 w-3" />
					{typeBadge.label}
				</Badge>
			</div>

			{/* Card Content */}
			<CardContent className="p-4">
				{/* Title (LLM-generated or fallback to truncated Story ID) */}
				<h3 className="mb-1 truncate font-medium text-foreground">
					{story.title ||
						(story.storyId.length > 20
							? `${story.storyId.slice(0, 20)}...`
							: story.storyId)}
				</h3>

				{/* Metadata Row */}
				<div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
					<span className="capitalize">{story.imageStyle || "default"}</span>
					<span>·</span>
					<span>{formatRelativeDate(story.updatedAt)}</span>
				</div>

				{/* Progress Badges */}
				<div className="flex flex-wrap items-center gap-1.5">
					<Tooltip>
						<TooltipTrigger asChild>
							<Badge variant="outline" className="gap-1 text-xs">
								<ImageIcon className="h-3 w-3" />
								{progress.withImage}/{progress.total}
							</Badge>
						</TooltipTrigger>
						<TooltipContent>
							{progress.withImage} of {progress.total} images generated
						</TooltipContent>
					</Tooltip>

					{progress.withAudio > 0 && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Badge
									variant="outline"
									className="gap-1 border-blue-500/30 text-xs text-blue-500"
								>
									<Volume2 className="h-3 w-3" />
									{progress.withAudio}
								</Badge>
							</TooltipTrigger>
							<TooltipContent>
								{progress.withAudio} audio clips generated
							</TooltipContent>
						</Tooltip>
					)}

					{progress.withVideo > 0 && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Badge
									variant="outline"
									className="gap-1 border-green-500/30 text-xs text-green-500"
								>
									<Video className="h-3 w-3" />
									{progress.withVideo}
								</Badge>
							</TooltipTrigger>
							<TooltipContent>
								{progress.withVideo} video clips generated
							</TooltipContent>
						</Tooltip>
					)}

					{story.hasExportedVideo && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Badge className="gap-1 border-purple-500/30 bg-purple-500/10 text-xs text-purple-500">
									<Download className="h-3 w-3" />
									Exported
								</Badge>
							</TooltipTrigger>
							<TooltipContent>Final video exported</TooltipContent>
						</Tooltip>
					)}
				</div>
			</CardContent>

			{/* Actions Menu (top right) */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="absolute right-2 top-2 h-8 w-8 bg-background/80 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
						onClick={(e) => e.stopPropagation()}
					>
						<MoreHorizontal className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => onResume(story)}>
						<Play className="mr-2 h-4 w-4" />
						Resume
					</DropdownMenuItem>
					<DropdownMenuItem
						onClick={(e) => onDelete(story.storyId, e)}
						className="text-destructive focus:text-destructive"
					>
						<Trash2 className="mr-2 h-4 w-4" />
						Delete
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</Card>
	);
}

// Helper function to calculate progress
function getProgress(story: StoryMetadata) {
	const scenes = story.scenes || [];
	return {
		total: scenes.length,
		withImage: scenes.filter((s) => s.imageUrl || s.imageId).length,
		withAudio: scenes.filter((s) => s.hasAudio || s.audioUrl || s.audioId)
			.length,
		withVideo: scenes.filter((s) => s.hasVideo || s.videoUrl || s.videoId)
			.length,
	};
}

// Helper function to format relative date
function formatRelativeDate(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return "Today";
	if (diffDays === 1) return "Yesterday";
	if (diffDays < 7) return `${diffDays} days ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
	if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
	return date.toLocaleDateString();
}
