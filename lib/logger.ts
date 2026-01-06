type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

const LEVEL_RANK: Record<Exclude<LogLevel, "silent">, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function flagEnabled(value: string | undefined | null): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return lower === "1" || lower === "true";
}

function normalizeLevel(value: string | undefined | null): LogLevel | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower === "silent" || lower === "error" || lower === "warn" || lower === "info" || lower === "debug") {
    return lower as LogLevel;
  }
  return undefined;
}

function resolveLogLevel(): LogLevel {
  const explicitLevel =
    normalizeLevel(process.env.LOG_LEVEL) ?? normalizeLevel(process.env.NEXT_PUBLIC_LOG_LEVEL);
  if (explicitLevel) return explicitLevel;

  const isProd = process.env.NODE_ENV === "production";
  if (isProd) return "silent";

  const debugFlag =
    (process.env.DEBUG ?? process.env.NEXT_PUBLIC_DEBUG ?? "").toLowerCase();
  const debugEnabled = debugFlag === "1" || debugFlag === "true";
  if (debugEnabled) return "debug";

  return "warn";
}

const activeLevel: LogLevel = resolveLogLevel();
const debugCopilotLogsEnabled = flagEnabled(process.env.DEBUG_COPILOT_LOGS);

const shouldLog = (level: Exclude<LogLevel, "silent">) => {
  if (activeLevel === "silent") return false;
  return LEVEL_RANK[level] <= LEVEL_RANK[activeLevel];
};

const noop = () => {};

export const logger = {
  level: activeLevel,
  error: shouldLog("error") ? (...args: unknown[]) => console.error(...args) : noop,
  warn: shouldLog("warn") ? (...args: unknown[]) => console.warn(...args) : noop,
  info: shouldLog("info") ? (...args: unknown[]) => console.info(...args) : noop,
  debug: shouldLog("debug") ? (...args: unknown[]) => console.debug(...args) : noop,
};

if (shouldLog("warn")) {
  console.warn("[logger:init]", {
    env: process.env.NODE_ENV ?? "unknown",
    level: activeLevel,
    debugCopilotLogsEnabled,
  });
}

