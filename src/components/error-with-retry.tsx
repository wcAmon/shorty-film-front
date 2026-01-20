import { AlertCircle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
			className={`flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm ${className}`}
		>
			<AlertCircle className="h-4 w-4 flex-shrink-0 text-destructive" />
			<span
				className="min-w-0 flex-1 truncate text-destructive"
				title={error}
			>
				{error}
			</span>
			<div className="flex flex-shrink-0 items-center gap-1">
				{onRetry && (
					<Button
						variant="ghost"
						size="sm"
						onClick={onRetry}
						disabled={isRetrying}
						className="h-auto gap-1 px-2 py-1 text-xs text-destructive hover:bg-destructive/20 hover:text-destructive"
					>
						<RefreshCw
							className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`}
						/>
						{isRetrying ? "重試中..." : "重試"}
					</Button>
				)}
				{onDismiss && (
					<Button
						variant="ghost"
						size="icon"
						onClick={onDismiss}
						className="h-6 w-6 text-destructive hover:bg-destructive/20 hover:text-destructive"
						title="關閉"
					>
						<X className="h-3 w-3" />
					</Button>
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
		<div className="mt-2 flex items-center gap-2 text-xs">
			<span
				className="min-w-0 flex-1 truncate text-destructive"
				title={error}
			>
				{error}
			</span>
			<div className="flex flex-shrink-0 items-center gap-1">
				{onRetry && (
					<Button
						variant="ghost"
						size="sm"
						onClick={onRetry}
						disabled={isRetrying}
						className="h-auto gap-1 rounded bg-destructive/20 px-2 py-0.5 text-destructive hover:bg-destructive/30 hover:text-destructive"
					>
						<RefreshCw
							className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`}
						/>
						{isRetrying ? "..." : "重試"}
					</Button>
				)}
				{onDismiss && (
					<Button
						variant="ghost"
						size="icon"
						onClick={onDismiss}
						className="h-5 w-5 rounded text-destructive hover:text-destructive"
					>
						<X className="h-3 w-3" />
					</Button>
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
		<div className="fixed bottom-4 right-4 z-50 max-w-md animate-in fade-in slide-in-from-bottom-2 duration-300">
			<div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-card px-4 py-3 shadow-lg">
				<AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
				<div className="min-w-0 flex-1">
					<p className="line-clamp-2 text-sm text-destructive">{error}</p>
				</div>
				<div className="flex flex-shrink-0 items-center gap-2">
					{onRetry && (
						<Button
							variant="destructive"
							size="sm"
							onClick={onRetry}
							disabled={isRetrying}
							className="gap-1"
						>
							<RefreshCw
								className={`h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
							/>
							{isRetrying ? "重試中" : "重試"}
						</Button>
					)}
					{onDismiss && (
						<Button
							variant="ghost"
							size="icon"
							onClick={onDismiss}
							className="h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground"
						>
							<X className="h-4 w-4" />
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
