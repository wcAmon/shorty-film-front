/**
 * Logger Service - 可配置的日誌系統
 *
 * 在 development 環境顯示所有 logs
 * 在 production 環境只顯示 warn 和 error
 *
 * 用法:
 * import { logger } from '@/lib/logger';
 * logger.debug('[ModuleName]', 'message', data);
 * logger.info('[ModuleName]', 'message');
 * logger.warn('[ModuleName]', 'warning message');
 * logger.error('[ModuleName]', 'error message', error);
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerConfig {
	enabledLevels: LogLevel[];
	enableTimestamp: boolean;
	enableModulePrefix: boolean;
}

const DEFAULT_CONFIG: LoggerConfig = {
	enabledLevels:
		typeof window !== "undefined" && import.meta.env.MODE === "production"
			? ["warn", "error"]
			: ["debug", "info", "warn", "error"],
	enableTimestamp: import.meta.env.MODE !== "production",
	enableModulePrefix: true,
};

class Logger {
	private config: LoggerConfig;

	constructor(config: Partial<LoggerConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	private isLevelEnabled(level: LogLevel): boolean {
		return this.config.enabledLevels.includes(level);
	}

	private formatMessage(level: LogLevel, args: unknown[]): unknown[] {
		const parts: unknown[] = [];

		if (this.config.enableTimestamp) {
			const now = new Date();
			const time = now.toLocaleTimeString("en-US", {
				hour12: false,
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
			});
			const ms = String(now.getMilliseconds()).padStart(3, "0");
			parts.push(`[${time}.${ms}]`);
		}

		parts.push(`[${level.toUpperCase()}]`);
		parts.push(...args);

		return parts;
	}

	/**
	 * Debug level - 開發時的詳細日誌，production 不顯示
	 */
	debug(...args: unknown[]): void {
		if (!this.isLevelEnabled("debug")) return;
		console.log(...this.formatMessage("debug", args));
	}

	/**
	 * Info level - 一般資訊，production 不顯示
	 */
	info(...args: unknown[]): void {
		if (!this.isLevelEnabled("info")) return;
		console.log(...this.formatMessage("info", args));
	}

	/**
	 * Warn level - 警告訊息，production 顯示
	 */
	warn(...args: unknown[]): void {
		if (!this.isLevelEnabled("warn")) return;
		console.warn(...this.formatMessage("warn", args));
	}

	/**
	 * Error level - 錯誤訊息，production 顯示
	 */
	error(...args: unknown[]): void {
		if (!this.isLevelEnabled("error")) return;
		console.error(...this.formatMessage("error", args));
	}

	/**
	 * 建立帶有模組前綴的 logger 實例
	 * 用法: const log = logger.module('[waitForJobCompletion]');
	 *       log.debug('Starting...');
	 */
	module(prefix: string): ModuleLogger {
		return new ModuleLogger(this, prefix);
	}

	/**
	 * 更新配置
	 */
	setConfig(config: Partial<LoggerConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * 取得當前配置
	 */
	getConfig(): LoggerConfig {
		return { ...this.config };
	}

	/**
	 * 在 production 中強制啟用 debug（用於臨時除錯）
	 */
	enableDebugInProduction(): void {
		if (!this.config.enabledLevels.includes("debug")) {
			this.config.enabledLevels = ["debug", ...this.config.enabledLevels];
		}
		if (!this.config.enabledLevels.includes("info")) {
			this.config.enabledLevels = ["info", ...this.config.enabledLevels];
		}
	}

	/**
	 * 停用所有 logs（用於測試）
	 */
	disable(): void {
		this.config.enabledLevels = [];
	}

	/**
	 * 重置為預設配置
	 */
	reset(): void {
		this.config = { ...DEFAULT_CONFIG };
	}
}

/**
 * 帶有模組前綴的 logger
 */
class ModuleLogger {
	constructor(
		private parent: Logger,
		private prefix: string,
	) {}

	debug(...args: unknown[]): void {
		this.parent.debug(this.prefix, ...args);
	}

	info(...args: unknown[]): void {
		this.parent.info(this.prefix, ...args);
	}

	warn(...args: unknown[]): void {
		this.parent.warn(this.prefix, ...args);
	}

	error(...args: unknown[]): void {
		this.parent.error(this.prefix, ...args);
	}
}

// 單例 logger 實例
export const logger = new Logger();

// 也導出 Logger 類別以便建立自訂實例
export { Logger, type LogLevel, type LoggerConfig };
