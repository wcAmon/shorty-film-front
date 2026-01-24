import { useRef, useEffect, useState, useCallback } from "react";
import { Volume2, GripVertical } from "lucide-react";

interface SoundEffectWaveformProps {
	audioUrl: string;
	duration: number; // sound effect duration in seconds
	videoDuration: number; // video duration in seconds (container width reference)
	offset: number; // current offset in seconds
	onOffsetChange: (offset: number) => void;
	disabled?: boolean;
}

export function SoundEffectWaveform({
	audioUrl,
	duration,
	videoDuration,
	offset,
	onOffsetChange,
	disabled = false,
}: SoundEffectWaveformProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [waveformData, setWaveformData] = useState<number[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const dragStartX = useRef(0);
	const dragStartOffset = useRef(0);

	// Calculate positions
	const maxOffset = Math.max(0, videoDuration - duration);

	// Load and analyze audio to generate waveform data
	useEffect(() => {
		if (!audioUrl) return;

		setIsLoading(true);

		const loadAudio = async () => {
			try {
				const response = await fetch(audioUrl);
				const arrayBuffer = await response.arrayBuffer();

				const audioContext = new AudioContext();
				const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

				// Get the raw audio data (first channel)
				const rawData = audioBuffer.getChannelData(0);

				// Sample the audio data to create waveform points
				const samples = 100; // Number of bars in the waveform
				const blockSize = Math.floor(rawData.length / samples);
				const filteredData: number[] = [];

				for (let i = 0; i < samples; i++) {
					let sum = 0;
					for (let j = 0; j < blockSize; j++) {
						sum += Math.abs(rawData[i * blockSize + j]);
					}
					filteredData.push(sum / blockSize);
				}

				// Normalize the data
				const maxVal = Math.max(...filteredData);
				const normalizedData = filteredData.map((val) =>
					maxVal > 0 ? val / maxVal : 0,
				);

				setWaveformData(normalizedData);
				await audioContext.close();
			} catch (err) {
				console.error("Failed to load audio for waveform:", err);
				// Generate fake waveform data on error
				const fakeData = Array(100)
					.fill(0)
					.map(() => Math.random() * 0.5 + 0.25);
				setWaveformData(fakeData);
			} finally {
				setIsLoading(false);
			}
		};

		loadAudio();
	}, [audioUrl]);

	// Draw waveform on canvas
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || waveformData.length === 0) return;

		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;

		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx.scale(dpr, dpr);

		// Clear canvas
		ctx.clearRect(0, 0, width, height);

		// Draw waveform bars
		const barWidth = width / waveformData.length;
		const barGap = 1;

		waveformData.forEach((value, index) => {
			const barHeight = value * (height - 4);
			const x = index * barWidth;
			const y = (height - barHeight) / 2;

			ctx.fillStyle = "rgba(99, 102, 241, 0.8)"; // indigo-500
			ctx.fillRect(x + barGap / 2, y, barWidth - barGap, barHeight);
		});
	}, [waveformData]);

	// Handle drag start
	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (disabled) return;

			setIsDragging(true);
			dragStartX.current = e.clientX;
			dragStartOffset.current = offset;

			e.preventDefault();
		},
		[disabled, offset],
	);

	// Handle drag move
	useEffect(() => {
		if (!isDragging) return;

		const handleMouseMove = (e: MouseEvent) => {
			const container = containerRef.current;
			if (!container) return;

			const containerWidth = container.clientWidth;
			const pixelsPerSecond = containerWidth / videoDuration;

			const deltaX = e.clientX - dragStartX.current;
			const deltaSeconds = deltaX / pixelsPerSecond;

			let newOffset = dragStartOffset.current + deltaSeconds;

			// Clamp offset to valid range
			newOffset = Math.max(0, Math.min(maxOffset, newOffset));

			// Snap to 0.1s increments
			newOffset = Math.round(newOffset * 10) / 10;

			onOffsetChange(newOffset);
		};

		const handleMouseUp = () => {
			setIsDragging(false);
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [isDragging, videoDuration, maxOffset, onOffsetChange]);

	// Calculate waveform position and width as percentage
	const waveformLeftPercent = (offset / videoDuration) * 100;
	const waveformWidthPercent = (duration / videoDuration) * 100;

	return (
		<div className="relative mt-2">
			{/* Label */}
			<div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
				<Volume2 className="h-3 w-3" />
				<span>Sound Effect</span>
				<span className="text-indigo-400">
					({offset.toFixed(1)}s offset, {duration.toFixed(1)}s duration)
				</span>
			</div>

			{/* Timeline container */}
			<div
				ref={containerRef}
				className="relative h-10 rounded-lg border border-border bg-muted/30"
			>
				{/* Video duration markers */}
				<div className="absolute inset-x-0 top-0 flex h-full items-center justify-between px-1 text-[10px] text-muted-foreground/50">
					<span>0s</span>
					<span>{videoDuration.toFixed(1)}s</span>
				</div>

				{/* Draggable waveform */}
				<div
					className={`absolute top-1 bottom-1 cursor-${isDragging ? "grabbing" : disabled ? "default" : "grab"} rounded bg-indigo-500/20 ${
						isDragging ? "ring-2 ring-indigo-500" : ""
					} ${disabled ? "opacity-50" : "hover:bg-indigo-500/30"}`}
					style={{
						left: `${waveformLeftPercent}%`,
						width: `${Math.min(waveformWidthPercent, 100 - waveformLeftPercent)}%`,
					}}
					onMouseDown={handleMouseDown}
				>
					{/* Drag handle */}
					{!disabled && (
						<div className="absolute left-0 top-1/2 flex h-6 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded bg-indigo-600 text-white shadow-lg">
							<GripVertical className="h-3 w-3" />
						</div>
					)}

					{/* Waveform canvas */}
					{isLoading ? (
						<div className="flex h-full items-center justify-center text-xs text-muted-foreground">
							Loading...
						</div>
					) : (
						<canvas
							ref={canvasRef}
							className="h-full w-full"
							style={{ display: "block" }}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
