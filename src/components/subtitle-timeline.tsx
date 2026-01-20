import { useRef, useEffect, useState } from "react";
import type {
	SubtitleSegment,
	SceneBoundary,
	SubtitleColor,
} from "@/stores/subtitle-editor.store";

// ============================================================================
// Types
// ============================================================================

interface SubtitleTimelineProps {
	segments: SubtitleSegment[];
	sceneBoundaries: SceneBoundary[];
	totalDuration: number;
	selectedSegmentId: string | null;
	onSegmentSelect: (segmentId: string) => void;
}

// ============================================================================
// Color Mapping
// ============================================================================

const COLOR_MAP: Record<SubtitleColor, string> = {
	white: "bg-white",
	red: "bg-red-500",
	blue: "bg-blue-500",
	yellow: "bg-yellow-400",
	green: "bg-green-500",
	orange: "bg-orange-500",
};

const COLOR_BORDER_MAP: Record<SubtitleColor, string> = {
	white: "border-white",
	red: "border-red-500",
	blue: "border-blue-500",
	yellow: "border-yellow-400",
	green: "border-green-500",
	orange: "border-orange-500",
};

// Scene background colors (alternating for visual distinction)
const SCENE_COLORS = ["bg-slate-800/30", "bg-slate-700/30"];

// ============================================================================
// Helper Functions
// ============================================================================

function formatTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	const ms = Math.floor((seconds % 1) * 10);
	return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms}`;
}

// ============================================================================
// Component
// ============================================================================

export function SubtitleTimeline({
	segments,
	sceneBoundaries,
	totalDuration,
	selectedSegmentId,
	onSegmentSelect,
}: SubtitleTimelineProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [pixelsPerSecond, setPixelsPerSecond] = useState(40); // Default zoom level

	// Calculate timeline height based on duration and zoom
	const timelineHeight = totalDuration * pixelsPerSecond;

	// Time markers (every 5 seconds)
	const timeMarkers: number[] = [];
	for (let t = 0; t <= totalDuration; t += 5) {
		timeMarkers.push(t);
	}

	// Handle zoom with wheel
	const handleWheel = (e: WheelEvent) => {
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
			const delta = e.deltaY > 0 ? -5 : 5;
			setPixelsPerSecond((prev) => Math.max(20, Math.min(100, prev + delta)));
		}
	};

	useEffect(() => {
		const container = containerRef.current;
		if (container) {
			container.addEventListener("wheel", handleWheel, { passive: false });
			return () => container.removeEventListener("wheel", handleWheel);
		}
	}, []);

	// Scroll to selected segment
	useEffect(() => {
		if (selectedSegmentId && containerRef.current) {
			const segmentEl = document.getElementById(`segment-${selectedSegmentId}`);
			if (segmentEl) {
				segmentEl.scrollIntoView({ behavior: "smooth", block: "center" });
			}
		}
	}, [selectedSegmentId]);

	return (
		<div className="space-y-2">
			{/* Zoom indicator */}
			<div className="flex items-center justify-between text-xs text-muted-foreground px-2">
				<span>Zoom: {pixelsPerSecond}px/s (Ctrl + Scroll to zoom)</span>
				<span>Total: {formatTime(totalDuration)}</span>
			</div>

			{/* Timeline container - vertical scroll */}
			<div
				ref={containerRef}
				className="relative overflow-y-auto border border-border rounded-lg bg-background"
				style={{ maxHeight: "500px" }}
			>
				<div
					className="relative flex"
					style={{ height: `${Math.max(timelineHeight, 400)}px` }}
				>
					{/* Time ruler (left side) */}
					<div className="sticky left-0 w-16 border-r border-border bg-muted/50 flex-shrink-0 z-10">
						{timeMarkers.map((time) => (
							<div
								key={time}
								className="absolute left-0 w-full flex items-center justify-end pr-2"
								style={{ top: `${time * pixelsPerSecond}px` }}
							>
								<span className="text-[10px] text-muted-foreground font-mono">
									{formatTime(time)}
								</span>
								<div className="absolute right-0 w-2 h-px bg-border" />
							</div>
						))}
					</div>

					{/* Main timeline area */}
					<div className="flex-1 relative">
						{/* Scene boundaries (background stripes) */}
						{sceneBoundaries.map((scene, index) => (
							<div
								key={scene.sceneId}
								className={`absolute left-0 right-0 ${SCENE_COLORS[index % 2]} border-b border-border/50 ${!scene.hasTimestamps ? "opacity-50" : ""}`}
								style={{
									top: `${scene.startTime * pixelsPerSecond}px`,
									height: `${(scene.endTime - scene.startTime) * pixelsPerSecond}px`,
								}}
							>
								{/* Scene label */}
								<div className="sticky top-0 px-3 py-1 text-xs text-muted-foreground bg-background/80 border-b border-border/30">
									{scene.title}
									{!scene.hasTimestamps && " (無字幕)"}
								</div>
							</div>
						))}

						{/* Subtitle segments */}
						{segments.map((segment) => {
							const isSelected = segment.id === selectedSegmentId;
							const topPosition = segment.absoluteStartTime * pixelsPerSecond;
							const height =
								(segment.absoluteEndTime - segment.absoluteStartTime) *
								pixelsPerSecond;

							return (
								<button
									type="button"
									key={segment.id}
									id={`segment-${segment.id}`}
									onClick={() => onSegmentSelect(segment.id)}
									className={`absolute left-20 right-4 rounded-md border-2 transition-all cursor-pointer hover:opacity-90 overflow-hidden ${
										isSelected
											? `${COLOR_BORDER_MAP[segment.color]} ring-2 ring-cyan-400 ring-offset-2 ring-offset-background`
											: "border-transparent"
									}`}
									style={{
										top: `${topPosition + 24}px`, // +24 to account for scene label
										minHeight: `${Math.max(height, 28)}px`,
									}}
									title={`${segment.text} (${formatTime(segment.absoluteStartTime)} - ${formatTime(segment.absoluteEndTime)})`}
								>
									<div
										className={`w-full h-full ${COLOR_MAP[segment.color]} bg-opacity-80 rounded flex items-center px-3 py-1`}
									>
										<span className="text-xs text-black font-medium truncate">
											{formatTime(segment.absoluteStartTime)} ~ {formatTime(segment.absoluteEndTime)}
										</span>
										<span className="mx-2 text-black/50">|</span>
										<span className="text-sm text-black font-medium truncate flex-1">
											{segment.text}
										</span>
									</div>
								</button>
							);
						})}
					</div>
				</div>
			</div>

			{/* Legend */}
			<div className="flex items-center gap-4 text-xs text-muted-foreground px-2">
				<span>Legend:</span>
				{Object.entries(COLOR_MAP).map(([color, bgClass]) => (
					<div key={color} className="flex items-center gap-1">
						<div className={`w-3 h-3 rounded ${bgClass}`} />
						<span className="capitalize">{color}</span>
					</div>
				))}
			</div>
		</div>
	);
}
