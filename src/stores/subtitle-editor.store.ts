import { Store } from "@tanstack/store";
import type { WordTimestamp } from "@/hooks/use-aistory-api";

// ============================================================================
// Types
// ============================================================================

export type SubtitleSize = "small" | "medium" | "large";
export type SubtitlePosition = "top" | "center" | "bottom";
export type SubtitleColor =
	| "white"
	| "red"
	| "blue"
	| "yellow"
	| "green"
	| "orange";
export type SubtitleDisplayMode = "segment" | "word" | "karaoke";

export interface WordTiming {
	word: string;
	startTime: number;
	endTime: number;
}

export interface SubtitleSegment {
	id: string;
	sceneId: string;
	sceneIndex: number;
	text: string;
	relativeStartTime: number; // 相對於 scene 的時間
	relativeEndTime: number;
	absoluteStartTime: number; // 相對於整個影片的時間
	absoluteEndTime: number;
	color: SubtitleColor;
	wordTimings?: WordTiming[]; // For word-by-word and karaoke modes
}

export interface SceneBoundary {
	sceneId: string;
	sceneIndex: number;
	title: string;
	startTime: number;
	endTime: number;
	hasTimestamps: boolean;
}

export interface SubtitleEditorState {
	storyId: string | null;
	segments: SubtitleSegment[];
	sceneBoundaries: SceneBoundary[];
	selectedSegmentId: string | null;
	globalSize: SubtitleSize;
	globalPosition: SubtitlePosition;
	displayMode: SubtitleDisplayMode;
	totalDuration: number;
	isInitialized: boolean;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: SubtitleEditorState = {
	storyId: null,
	segments: [],
	sceneBoundaries: [],
	selectedSegmentId: null,
	globalSize: "medium",
	globalPosition: "bottom",
	displayMode: "segment",
	totalDuration: 0,
	isInitialized: false,
};

// ============================================================================
// Store
// ============================================================================

export const subtitleEditorStore = new Store<SubtitleEditorState>(initialState);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Group word timestamps into subtitle segments (3-4 words each)
 * Breaks on significant pauses (>0.3s gap)
 * Returns word timings for each segment (for word-by-word and karaoke modes)
 */
function groupWordsIntoSegments(
	words: WordTimestamp[],
	maxWords = 4,
): Array<{
	text: string;
	startTime: number;
	endTime: number;
	wordTimings: WordTiming[];
}> {
	if (!words || words.length === 0) return [];

	const segments: Array<{
		text: string;
		startTime: number;
		endTime: number;
		wordTimings: WordTiming[];
	}> = [];
	let currentWords: WordTimestamp[] = [];

	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		const prevWord = i > 0 ? words[i - 1] : null;

		// Check for significant pause (>0.3s gap between words)
		const hasSignificantPause =
			prevWord && word.startTime - prevWord.endTime > 0.3;

		// Start new segment if:
		// 1. Current segment reached max words
		// 2. There's a significant pause
		if (
			currentWords.length >= maxWords ||
			(hasSignificantPause && currentWords.length > 0)
		) {
			segments.push({
				text: currentWords.map((w) => w.word).join(" "),
				startTime: currentWords[0].startTime,
				endTime: currentWords[currentWords.length - 1].endTime,
				wordTimings: currentWords.map((w) => ({
					word: w.word,
					startTime: w.startTime,
					endTime: w.endTime,
				})),
			});
			currentWords = [];
		}

		currentWords.push(word);
	}

	// Add remaining words as final segment
	if (currentWords.length > 0) {
		segments.push({
			text: currentWords.map((w) => w.word).join(" "),
			startTime: currentWords[0].startTime,
			endTime: currentWords[currentWords.length - 1].endTime,
			wordTimings: currentWords.map((w) => ({
				word: w.word,
				startTime: w.startTime,
				endTime: w.endTime,
			})),
		});
	}

	return segments;
}

// ============================================================================
// Actions
// ============================================================================

export interface SceneWithTimestamps {
	id: string;
	title: string;
	wordTimestamps?: WordTimestamp[];
	audioDuration?: number;
	videoDuration?: number;
}

export const subtitleEditorActions = {
	/**
	 * Initialize subtitle segments from scenes data
	 * Calculates cumulative time offsets for merged video
	 */
	initializeFromScenes: (storyId: string, scenes: SceneWithTimestamps[]) => {
		let cumulativeTime = 0;
		const segments: SubtitleSegment[] = [];
		const sceneBoundaries: SceneBoundary[] = [];

		scenes.forEach((scene, sceneIndex) => {
			const sceneStartOffset = cumulativeTime;
			const hasTimestamps =
				!!scene.wordTimestamps && scene.wordTimestamps.length > 0;

			// Use videoDuration if available, otherwise audioDuration, otherwise default 5s
			const sceneDuration =
				scene.videoDuration || scene.audioDuration || 5;

			// Add scene boundary
			sceneBoundaries.push({
				sceneId: scene.id,
				sceneIndex,
				title: scene.title,
				startTime: sceneStartOffset,
				endTime: sceneStartOffset + sceneDuration,
				hasTimestamps,
			});

			// Only create segments if scene has word timestamps
			if (hasTimestamps && scene.wordTimestamps) {
				const grouped = groupWordsIntoSegments(scene.wordTimestamps, 4);

				grouped.forEach((group, groupIndex) => {
					segments.push({
						id: `${scene.id}-seg-${groupIndex}`,
						sceneId: scene.id,
						sceneIndex,
						text: group.text,
						relativeStartTime: group.startTime,
						relativeEndTime: group.endTime,
						absoluteStartTime: group.startTime + sceneStartOffset,
						absoluteEndTime: group.endTime + sceneStartOffset,
						color: "white", // Default color
						// Convert relative word timings to absolute timings
						wordTimings: group.wordTimings.map((wt) => ({
							word: wt.word,
							startTime: wt.startTime + sceneStartOffset,
							endTime: wt.endTime + sceneStartOffset,
						})),
					});
				});
			}

			cumulativeTime += sceneDuration;
		});

		subtitleEditorStore.setState((state) => ({
			...state,
			storyId,
			segments,
			sceneBoundaries,
			totalDuration: cumulativeTime,
			isInitialized: true,
			selectedSegmentId: null,
		}));
	},

	/**
	 * Select a segment for editing
	 */
	setSelectedSegment: (segmentId: string | null) => {
		subtitleEditorStore.setState((state) => ({
			...state,
			selectedSegmentId: segmentId,
		}));
	},

	/**
	 * Update a segment's color
	 */
	updateSegmentColor: (segmentId: string, color: SubtitleColor) => {
		subtitleEditorStore.setState((state) => ({
			...state,
			segments: state.segments.map((seg) =>
				seg.id === segmentId ? { ...seg, color } : seg,
			),
		}));
	},

	/**
	 * Set global subtitle size
	 */
	setGlobalSize: (size: SubtitleSize) => {
		subtitleEditorStore.setState((state) => ({
			...state,
			globalSize: size,
		}));
	},

	/**
	 * Set global subtitle position
	 */
	setGlobalPosition: (position: SubtitlePosition) => {
		subtitleEditorStore.setState((state) => ({
			...state,
			globalPosition: position,
		}));
	},

	/**
	 * Set subtitle display mode
	 */
	setDisplayMode: (displayMode: SubtitleDisplayMode) => {
		subtitleEditorStore.setState((state) => ({
			...state,
			displayMode,
		}));
	},

	/**
	 * Reset the store to initial state
	 */
	reset: () => {
		subtitleEditorStore.setState(() => initialState);
	},

	/**
	 * Get subtitle data for export
	 */
	getExportData: () => {
		const state = subtitleEditorStore.state;
		if (!state.isInitialized) return null;

		return {
			segments: state.segments.map((seg) => ({
				text: seg.text,
				absoluteStartTime: seg.absoluteStartTime,
				absoluteEndTime: seg.absoluteEndTime,
				color: seg.color,
				wordTimings: seg.wordTimings,
			})),
			globalSize: state.globalSize,
			globalPosition: state.globalPosition,
			displayMode: state.displayMode,
		};
	},

	/**
	 * Get settings for persistence (to save to database)
	 * Returns global settings and per-segment color customizations
	 */
	getSettingsForPersistence: () => {
		const state = subtitleEditorStore.state;
		if (!state.isInitialized) return null;

		// Build segmentColors map - only include non-default (non-white) colors
		const segmentColors: Record<string, SubtitleColor> = {};
		for (const seg of state.segments) {
			if (seg.color !== "white") {
				segmentColors[seg.id] = seg.color;
			}
		}

		return {
			globalSize: state.globalSize,
			globalPosition: state.globalPosition,
			displayMode: state.displayMode,
			segmentColors,
		};
	},

	/**
	 * Restore settings from persisted data
	 * Called after initializeFromScenes to apply saved customizations
	 */
	restoreFromSettings: (settings: {
		globalSize: SubtitleSize;
		globalPosition: SubtitlePosition;
		displayMode: SubtitleDisplayMode;
		segmentColors: Record<string, SubtitleColor>;
	}) => {
		subtitleEditorStore.setState((state) => ({
			...state,
			globalSize: settings.globalSize,
			globalPosition: settings.globalPosition,
			displayMode: settings.displayMode,
			// Apply segment colors from saved settings
			segments: state.segments.map((seg) => ({
				...seg,
				color: settings.segmentColors[seg.id] || seg.color,
			})),
		}));
	},
};
