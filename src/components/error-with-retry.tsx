import { AlertCircle, RefreshCw, X } from "lucide-react";

interface ErrorWithRetryProps {
	error: string;
	onRetry?: () => void;
	onDismiss?: () => void;
	isRetrying?: boolean;
	className?: string;
}

/**
 * 錯誤提示組件，帶有重試按鈕
 * 用於顯示 API 錯誤並允許用戶重試操作
 */
export function ErrorWithRetry({
	error,
	onRetry,
	onDismiss,
	isRetrying = false,
	className = "",
}: ErrorWithRetryProps) {
	return (
		<div
			className={`flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm ${className}`}
		>
			<AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
			<span className="text-red-300 flex-1 min-w-0 truncate" title={error}>
				{error}
			</span>
			<div className="flex items-center gap-1 flex-shrink-0">
				{onRetry && (
					<button
						type="button"
						onClick={onRetry}
						disabled={isRetrying}
						className="flex items-center gap-1 px-2 py-1 text-xs text-red-300 hover:text-red-200 hover:bg-red-500/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<RefreshCw
							className={`w-3 h-3 ${isRetrying ? "animate-spin" : ""}`}
						/>
						{isRetrying ? "重試中..." : "重試"}
					</button>
				)}
				{onDismiss && (
					<button
						type="button"
						onClick={onDismiss}
						className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition-colors"
						title="關閉"
					>
						<X className="w-3 h-3" />
					</button>
				)}
			</div>
		</div>
	);
}

/**
 * 內嵌錯誤提示 - 用於卡片或小區域
 */
export function InlineError({
	error,
	onRetry,
	onDismiss,
	isRetrying = false,
}: Omit<ErrorWithRetryProps, "className">) {
	return (
		<div className="flex items-center gap-2 mt-2 text-xs">
			<span className="text-red-400 flex-1 min-w-0 truncate" title={error}>
				{error}
			</span>
			<div className="flex items-center gap-1 flex-shrink-0">
				{onRetry && (
					<button
						type="button"
						onClick={onRetry}
						disabled={isRetrying}
						className="flex items-center gap-1 px-2 py-0.5 text-red-300 hover:text-red-200 bg-red-500/20 hover:bg-red-500/30 rounded transition-colors disabled:opacity-50"
					>
						<RefreshCw
							className={`w-3 h-3 ${isRetrying ? "animate-spin" : ""}`}
						/>
						{isRetrying ? "..." : "重試"}
					</button>
				)}
				{onDismiss && (
					<button
						type="button"
						onClick={onDismiss}
						className="p-0.5 text-red-400 hover:text-red-300 rounded"
					>
						<X className="w-3 h-3" />
					</button>
				)}
			</div>
		</div>
	);
}

/**
 * Toast 風格的錯誤通知
 */
export function ErrorToast({
	error,
	onRetry,
	onDismiss,
	isRetrying = false,
}: Omit<ErrorWithRetryProps, "className">) {
	return (
		<div className="fixed bottom-4 right-4 z-50 max-w-md animate-in slide-in-from-bottom-2 fade-in duration-300">
			<div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border border-red-500/50 rounded-lg shadow-lg">
				<AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
				<div className="flex-1 min-w-0">
					<p className="text-sm text-red-300 line-clamp-2">{error}</p>
				</div>
				<div className="flex items-center gap-2 flex-shrink-0">
					{onRetry && (
						<button
							type="button"
							onClick={onRetry}
							disabled={isRetrying}
							className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded transition-colors disabled:opacity-50"
						>
							<RefreshCw
								className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`}
							/>
							{isRetrying ? "重試中" : "重試"}
						</button>
					)}
					{onDismiss && (
						<button
							type="button"
							onClick={onDismiss}
							className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
						>
							<X className="w-4 h-4" />
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
