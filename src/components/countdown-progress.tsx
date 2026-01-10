import { useEffect, useState } from "react";

interface CountdownProgressProps {
	isActive: boolean;
	durationSeconds: number;
	onComplete?: () => void;
}

export function CountdownProgress({
	isActive,
	durationSeconds,
}: CountdownProgressProps) {
	const [elapsedSeconds, setElapsedSeconds] = useState(0);

	useEffect(() => {
		if (!isActive) {
			setElapsedSeconds(0);
			return;
		}

		const interval = setInterval(() => {
			setElapsedSeconds((prev) => {
				if (prev >= durationSeconds) {
					return prev; // Cap at max
				}
				return prev + 1;
			});
		}, 1000);

		return () => clearInterval(interval);
	}, [isActive, durationSeconds]);

	// Reset when generation completes
	useEffect(() => {
		if (!isActive) {
			setElapsedSeconds(0);
		}
	}, [isActive]);

	if (!isActive) return null;

	const progressPercent = Math.min(
		(elapsedSeconds / durationSeconds) * 100,
		100,
	);
	const remainingSeconds = Math.max(durationSeconds - elapsedSeconds, 0);
	const minutes = Math.floor(remainingSeconds / 60);
	const seconds = remainingSeconds % 60;

	return (
		<div className="w-full mb-3">
			<div className="flex justify-between text-xs text-slate-400 mb-1">
				<span>Estimated time remaining</span>
				<span>
					{minutes}:{seconds.toString().padStart(2, "0")}
				</span>
			</div>
			<div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
				<div
					className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-1000 ease-linear"
					style={{ width: `${progressPercent}%` }}
				/>
			</div>
		</div>
	);
}
