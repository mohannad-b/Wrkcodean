import { logger } from "@/lib/logger";

const DEV_AGENT_LOG_URL = process.env.NEXT_PUBLIC_DEV_AGENT_LOG_URL ?? process.env.DEV_AGENT_LOG_URL;
const DEV_AGENT_LOG_ENABLED = (() => {
  const flag = process.env.DEV_AGENT_LOG;
  if (!flag) return false;
  return flag === "1" || flag.toLowerCase() === "true";
})();
const DEFAULT_THROTTLE_MS = 1000;

type Transport = "console" | "fetch";

type SendOptions = {
  dedupeKey?: string;
  throttleMs?: number;
  sampleRate?: number; // 0..1
};

const recentLogTimestamps = new Map<string, number>();

function shouldSample(sampleRate: number): boolean {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;
  return Math.random() < sampleRate;
}

function deriveDedupeKey(payload: Record<string, unknown>, options?: SendOptions) {
  if (options?.dedupeKey) return options.dedupeKey;
  const parts = [
    payload.location,
    payload.message,
    (payload as any).action,
    (payload as any).workflowId,
    (payload as any).userId,
  ]
    .filter(Boolean)
    .join("|");
  return parts || "agent-log";
}

function shouldThrottle(key: string, throttleMs: number): boolean {
  const now = Date.now();
  const last = recentLogTimestamps.get(key);
  if (last && now - last < throttleMs) {
    return true;
  }
  recentLogTimestamps.set(key, now);
  return false;
}

function getTransport(): Transport {
  const t = process.env.DEV_AGENT_LOG_TRANSPORT;
  if (t === "fetch") return "fetch";
  return "console";
}

export function isDevAgentLogEnabled() {
  return DEV_AGENT_LOG_ENABLED;
}

export function sendDevAgentLog(payload: Record<string, unknown>, options?: SendOptions) {
  if (!DEV_AGENT_LOG_ENABLED) return;

  const throttleMs = options?.throttleMs ?? DEFAULT_THROTTLE_MS;
  const sampleRate = options?.sampleRate ?? 1;
  if (!shouldSample(sampleRate)) return;

  const dedupeKey = deriveDedupeKey(payload, options);
  if (shouldThrottle(dedupeKey, throttleMs)) return;

  const record = {
    channel: "agent-log",
    ...payload,
    timestamp: Date.now(),
  };

  const transport = getTransport();
  if (transport === "fetch" && DEV_AGENT_LOG_URL) {
    fetch(DEV_AGENT_LOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    }).catch(() => {});
    return;
  }

  logger.debug(JSON.stringify(record));
}


