import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function StoryCardSkeleton() {
	return (
		<Card className="overflow-hidden border-border/40 bg-card">
			{/* Thumbnail skeleton */}
			<Skeleton className="aspect-[16/9] w-full rounded-none" />

			{/* Card Content */}
			<CardContent className="p-4">
				{/* Title skeleton */}
				<Skeleton className="mb-1 h-5 w-3/4" />

				{/* Metadata row skeleton */}
				<div className="mb-3 flex items-center gap-2">
					<Skeleton className="h-3 w-16" />
					<Skeleton className="h-3 w-20" />
				</div>

				{/* Progress badges skeleton */}
				<div className="flex flex-wrap items-center gap-1.5">
					<Skeleton className="h-5 w-12 rounded-full" />
					<Skeleton className="h-5 w-10 rounded-full" />
				</div>
			</CardContent>
		</Card>
	);
}
