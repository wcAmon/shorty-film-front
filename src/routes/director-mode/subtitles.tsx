import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useStore } from "@tanstack/react-store";
import { ArrowLeft, Captions, Check, Film, Type } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SubtitleTimeline } from "@/components/subtitle-timeline";
import { directorStore } from "@/stores/director.store";
import {
	subtitleEditorStore,
	subtitleEditorActions,
	type SubtitleSize,
	type SubtitlePosition,
	type SubtitleColor,
} from "@/stores/subtitle-editor.store";

// ============================================================================
// Route Configuration
// ============================================================================

export const Route = createFileRoute("/director-mode/subtitles")({
	beforeLoad: () => {
		const state = directorStore.state;
		// Check if at least one scene has word timestamps
		const hasAnyTimestamps = state.scenes.some(
			(s) => s.wordTimestamps && s.wordTimestamps.length > 0
		);
		if (!hasAnyTimestamps) {
			throw redirect({ to: "/director-mode/scenes" });
		}
	},
	component: DirectorSubtitlesPage,
});

// ============================================================================
// Constants
// ============================================================================

const SIZE_OPTIONS: { id: SubtitleSize; label: string }[] = [
	{ id: "small", label: "小" },
	{ id: "medium", label: "中" },
	{ id: "large", label: "大" },
];

const POSITION_OPTIONS: { id: SubtitlePosition; label: string }[] = [
	{ id: "top", label: "上" },
	{ id: "center", label: "中" },
	{ id: "bottom", label: "下" },
];

const COLOR_OPTIONS: { id: SubtitleColor; label: string; bgClass: string }[] = [
	{ id: "white", label: "白", bgClass: "bg-white" },
	{ id: "red", label: "紅", bgClass: "bg-red-500" },
	{ id: "blue", label: "藍", bgClass: "bg-blue-500" },
	{ id: "yellow", label: "黃", bgClass: "bg-yellow-400" },
	{ id: "green", label: "綠", bgClass: "bg-green-500" },
	{ id: "orange", label: "橘", bgClass: "bg-orange-500" },
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

function DirectorSubtitlesPage() {
	// Subscribe to director store
	const scenes = useStore(directorStore, (state) => state.scenes);
	const storyId = useStore(directorStore, (state) => state.storyId);

	// Subscribe to subtitle editor store
	const segments = useStore(subtitleEditorStore, (state) => state.segments);
	const sceneBoundaries = useStore(
		subtitleEditorStore,
		(state) => state.sceneBoundaries
	);
	const totalDuration = useStore(
		subtitleEditorStore,
		(state) => state.totalDuration
	);
	const selectedSegmentId = useStore(
		subtitleEditorStore,
		(state) => state.selectedSegmentId
	);
	const globalSize = useStore(subtitleEditorStore, (state) => state.globalSize);
	const globalPosition = useStore(
		subtitleEditorStore,
		(state) => state.globalPosition
	);
	const isInitialized = useStore(
		subtitleEditorStore,
		(state) => state.isInitialized
	);
	const editorStoryId = useStore(
		subtitleEditorStore,
		(state) => state.storyId
	);

	// Initialize or re-initialize subtitle editor when scenes change
	useEffect(() => {
		if (storyId && scenes.length > 0) {
			// Re-initialize if storyId changed or not initialized
			if (!isInitialized || editorStoryId !== storyId) {
				const scenesWithTimestamps = scenes.map((scene) => ({
					id: scene.id,
					title: `Scene ${scene.orderIndex + 1}`,
					wordTimestamps: scene.wordTimestamps?.map((wt) => ({
						word: wt.word,
						startTime: wt.startTime,
						endTime: wt.endTime,
					})) || null,
					audioDuration: scene.audioDuration,
					videoDuration: scene.videoDuration,
				}));
				subtitleEditorActions.initializeFromScenes(storyId, scenesWithTimestamps);
			}
		}
	}, [storyId, scenes, isInitialized, editorStoryId]);

	// Get selected segment details
	const selectedSegment = segments.find((s) => s.id === selectedSegmentId);

	// Handle segment selection
	const handleSegmentSelect = (segmentId: string) => {
		subtitleEditorActions.setSelectedSegment(segmentId);
	};

	// Handle color change for selected segment
	const handleColorChange = (color: SubtitleColor) => {
		if (selectedSegmentId) {
			subtitleEditorActions.updateSegmentColor(selectedSegmentId, color);
		}
	};

	return (
		<div className="space-y-6">
			{/* Header with navigation */}
			<div className="flex items-center justify-between">
				<Link to="/director-mode/scenes">
					<Button variant="ghost" className="flex items-center gap-2">
						<ArrowLeft className="w-4 h-4" />
						Back to Scenes
					</Button>
				</Link>
				<h1 className="text-xl font-bold text-foreground flex items-center gap-2">
					<Captions className="w-6 h-6 text-amber-400" />
					字幕編輯器 (16:9)
				</h1>
				<Link to="/director-mode/export">
					<Button className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400">
						<Film className="w-4 h-4" />
						Export
					</Button>
				</Link>
			</div>

			{/* Global Settings Card */}
			<Card>
				<CardContent className="p-6">
					<h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
						<Type className="w-5 h-5 text-cyan-400" />
						全域設定
					</h3>

					<div className="grid grid-cols-2 gap-6">
						{/* Size selector */}
						<div>
							<label className="block text-sm text-muted-foreground mb-2">
								字體大小
							</label>
							<div className="flex gap-2">
								{SIZE_OPTIONS.map((option) => (
									<button
										type="button"
										key={option.id}
										onClick={() => subtitleEditorActions.setGlobalSize(option.id)}
										className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all ${
											globalSize === option.id
												? "border-cyan-500 bg-cyan-500/20 text-cyan-400"
												: "border-border bg-muted text-muted-foreground hover:border-cyan-500/50"
										}`}
									>
										{option.label}
									</button>
								))}
							</div>
						</div>

						{/* Position selector */}
						<div>
							<label className="block text-sm text-muted-foreground mb-2">
								字幕位置
							</label>
							<div className="flex gap-2">
								{POSITION_OPTIONS.map((option) => (
									<button
										type="button"
										key={option.id}
										onClick={() =>
											subtitleEditorActions.setGlobalPosition(option.id)
										}
										className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all ${
											globalPosition === option.id
												? "border-purple-500 bg-purple-500/20 text-purple-400"
												: "border-border bg-muted text-muted-foreground hover:border-purple-500/50"
										}`}
									>
										{option.label}
									</button>
								))}
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Timeline Card */}
			<Card>
				<CardContent className="p-6">
					<h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
						<Film className="w-5 h-5 text-purple-400" />
						時間軸
					</h3>

					<SubtitleTimeline
						segments={segments}
						sceneBoundaries={sceneBoundaries}
						totalDuration={totalDuration}
						selectedSegmentId={selectedSegmentId}
						onSegmentSelect={handleSegmentSelect}
					/>
				</CardContent>
			</Card>

			{/* Selected Segment Editor Card */}
			<Card>
				<CardContent className="p-6">
					<h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
						<Captions className="w-5 h-5 text-emerald-400" />
						片段編輯
					</h3>

					{selectedSegment ? (
						<div className="space-y-4">
							{/* Segment text (read-only) */}
							<div>
								<label className="block text-sm text-muted-foreground mb-2">
									字幕內容
								</label>
								<div className="px-4 py-3 bg-muted border border-border rounded-lg text-foreground">
									{selectedSegment.text}
								</div>
							</div>

							{/* Time info */}
							<div className="flex gap-4">
								<div className="flex-1">
									<label className="block text-sm text-muted-foreground mb-2">
										開始時間
									</label>
									<div className="px-4 py-2 bg-muted border border-border rounded-lg text-foreground font-mono text-sm">
										{formatTime(selectedSegment.absoluteStartTime)}
									</div>
								</div>
								<div className="flex-1">
									<label className="block text-sm text-muted-foreground mb-2">
										結束時間
									</label>
									<div className="px-4 py-2 bg-muted border border-border rounded-lg text-foreground font-mono text-sm">
										{formatTime(selectedSegment.absoluteEndTime)}
									</div>
								</div>
								<div className="flex-1">
									<label className="block text-sm text-muted-foreground mb-2">
										場景
									</label>
									<div className="px-4 py-2 bg-muted border border-border rounded-lg text-foreground text-sm">
										Scene {selectedSegment.sceneIndex + 1}
									</div>
								</div>
							</div>

							{/* Color selector */}
							<div>
								<label className="block text-sm text-muted-foreground mb-2">
									字幕顏色
								</label>
								<div className="flex gap-3">
									{COLOR_OPTIONS.map((option) => (
										<button
											type="button"
											key={option.id}
											onClick={() => handleColorChange(option.id)}
											className={`relative w-10 h-10 rounded-full border-2 transition-all ${option.bgClass} ${
												selectedSegment.color === option.id
													? "border-white ring-2 ring-cyan-400 ring-offset-2 ring-offset-background scale-110"
													: "border-transparent hover:scale-105"
											}`}
											title={option.label}
										>
											{selectedSegment.color === option.id && (
												<Check className="absolute inset-0 m-auto w-5 h-5 text-black" />
											)}
										</button>
									))}
								</div>
							</div>
						</div>
					) : (
						<div className="text-center py-8 text-muted-foreground">
							<Captions className="w-12 h-12 mx-auto mb-3 opacity-30" />
							<p>點擊時間軸上的字幕片段進行編輯</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Summary Card */}
			<Card>
				<CardContent className="p-6">
					<div className="flex items-center justify-between">
						<div className="text-muted-foreground">
							<span className="text-foreground font-semibold">
								{segments.length}
							</span>{" "}
							個字幕片段 |{" "}
							<span className="text-foreground font-semibold">
								{sceneBoundaries.filter((s) => s.hasTimestamps).length}
							</span>{" "}
							/{" "}
							<span className="text-foreground font-semibold">
								{sceneBoundaries.length}
							</span>{" "}
							場景有字幕
						</div>
						<Link to="/director-mode/export">
							<Button className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400">
								<Film className="w-4 h-4 mr-2" />
								前往匯出
							</Button>
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
