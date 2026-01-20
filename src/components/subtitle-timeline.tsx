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
const SCENE_COLORS = [
	"bg-slate-800/50",
	"bg-slate-700/50",
];

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
	const [pixelsPerSecond, setPixelsPerSecond] = useState(50); // Default zoom level

	// Calculate timeline width based on duration and zoom
	const timelineWidth = totalDuration * pixelsPerSecond;

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
			setPixelsPerSecond((prev) => Math.max(20, Math.min(200, prev + delta)));
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
				segmentEl.scrollIntoView({ behavior: "smooth", inline: "center" });
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

			{/* Timeline container */}
			<div
				ref={containerRef}
				className="relative overflow-x-auto border border-border rounded-lg bg-background"
				style={{ height: "200px" }}
			>
				<div
					className="relative"
					style={{ width: `${Math.max(timelineWidth, 800)}px`, height: "100%" }}
				>
					{/* Time ruler */}
					<div className="absolute top-0 left-0 right-0 h-6 border-b border-border bg-muted/50">
						{timeMarkers.map((time) => (
							<div
								key={time}
								className="absolute top-0 flex flex-col items-center"
								style={{ left: `${time * pixelsPerSecond}px` }}
							>
								<div className="w-px h-3 bg-border" />
								<span className="text-[10px] text-muted-foreground mt-0.5">
									{formatTime(time)}
								</span>
							</div>
						))}
					</div>

					{/* Scene boundaries layer */}
					<div className="absolute top-6 left-0 right-0 h-8 border-b border-border">
						{sceneBoundaries.map((scene, index) => (
							<div
								key={scene.sceneId}
								className={`absolute top-0 h-full ${SCENE_COLORS[index % 2]} border-r border-border flex items-center justify-center overflow-hidden ${!scene.hasTimestamps ? "opacity-50" : ""}`}
								style={{
									left: `${scene.startTime * pixelsPerSecond}px`,
									width: `${(scene.endTime - scene.startTime) * pixelsPerSecond}px`,
								}}
								title={scene.hasTimestamps ? scene.title : `${scene.title} (無音訊時間戳)`}
							>
								<span className="text-xs text-muted-foreground truncate px-2">
									{scene.title}
									{!scene.hasTimestamps && " (無字幕)"}
								</span>
							</div>
						))}
					</div>

					{/* Subtitle segments layer */}
					<div className="absolute top-14 left-0 right-0 bottom-0 py-2">
						{segments.map((segment) => {
							const isSelected = segment.id === selectedSegmentId;
							const width =
								(segment.absoluteEndTime - segment.absoluteStartTime) *
								pixelsPerSecond;

							return (
								<button
									type="button"
									key={segment.id}
									id={`segment-${segment.id}`}
									onClick={() => onSegmentSelect(segment.id)}
									className={`absolute h-12 rounded-md border-2 transition-all cursor-pointer hover:opacity-90 flex items-center justify-center overflow-hidden px-1 ${
										isSelected
											? `${COLOR_BORDER_MAP[segment.color]} ring-2 ring-cyan-400 ring-offset-2 ring-offset-background`
											: "border-transparent"
									}`}
									style={{
										left: `${segment.absoluteStartTime * pixelsPerSecond}px`,
										width: `${Math.max(width, 20)}px`,
										top: `${(segment.sceneIndex % 3) * 40}px`,
									}}
									title={`${segment.text} (${formatTime(segment.absoluteStartTime)} - ${formatTime(segment.absoluteEndTime)})`}
								>
									<div
										className={`w-full h-full ${COLOR_MAP[segment.color]} bg-opacity-80 rounded flex items-center justify-center`}
									>
										<span className="text-xs text-black font-medium truncate px-1">
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
