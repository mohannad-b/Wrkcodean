import { logger } from "@/lib/logger";

type LogLevel = "debug" | "info" | "warn" | "error";

type TraceContext = {
  runId?: string;
  requestId?: string;
  automationVersionId?: string;
  clientMessageId?: string;
  phase?: string;
  source?: string;
};

type TraceEventMeta = Record<string, unknown>;

type SpanHandle = {
  spanId: string;
  startedAt: number;
  name: string;
  parentSpanId?: string;
};

export type CopilotTrace = {
  event: (event: string, meta?: TraceEventMeta, level?: LogLevel) => void;
  phase: (phaseName: string) => CopilotTrace;
  spanStart: (spanName: string, meta?: TraceEventMeta) => SpanHandle;
  spanEnd: (span: SpanHandle, meta?: TraceEventMeta, level?: LogLevel) => void;
  isEnabled: boolean;
};

const DEBUG_ENABLED = process.env.DEBUG_COPILOT_LOGS === "true";
const MAX_STRING = 800;
const MAX_ARRAY = 10;
const MAX_META_BYTES = 4000;
const SENSITIVE_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "token",
  "access_token",
  "refresh_token",
  "api_key",
  "secret",
  "password",
  "oauth",
  "client_secret",
]);

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const TOKENISH_REGEX = /[A-Za-z0-9_\-]{24,}/;

function redactValue(value: unknown, markTruncated: () => void): unknown {
  if (typeof value === "string") {
    if (EMAIL_REGEX.test(value)) {
      markTruncated();
      return "[REDACTED_EMAIL]";
    }
    if (TOKENISH_REGEX.test(value)) {
      markTruncated();
      return "[REDACTED_TOKEN]";
    }
    if (value.length > MAX_STRING) {
      markTruncated();
      return `${value.slice(0, MAX_STRING)}…`;
    }
    return value;
  }
  return value;
}

function sanitizeMeta(meta?: TraceEventMeta): { meta?: TraceEventMeta; metaTruncated: boolean } {
  if (!meta) return { meta: undefined, metaTruncated: false };
  let truncated = false;

  const clamp = (value: unknown, path: string[] = []): unknown => {
    if (typeof value === "string") {
      return redactValue(value, () => {
        truncated = true;
      });
    }
    if (Array.isArray(value)) {
      const sliced = value.slice(0, MAX_ARRAY).map((v) => clamp(v, path));
      if (value.length > MAX_ARRAY) truncated = true;
      return sliced;
    }
    if (value && typeof value === "object") {
      const result: Record<string, unknown> = {};
      Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_KEYS.has(lowerKey)) {
          result[key] = "[REDACTED]";
          truncated = true;
          return;
        }
        result[key] = clamp(val, [...path, key]);
      });
      return result;
    }
    return value;
  };

  const sanitized = clamp(meta) as TraceEventMeta;

  try {
    const encoded = new TextEncoder().encode(JSON.stringify(sanitized));
    if (encoded.length > MAX_META_BYTES) {
      truncated = true;
      return { meta: { metaTruncated: true }, metaTruncated: true };
    }
  } catch {
    truncated = true;
    return { meta: { metaTruncated: true }, metaTruncated: true };
  }

  return { meta: sanitized, metaTruncated: truncated };
}

function logStructured(level: LogLevel, payload: Record<string, unknown>) {
  try {
    // Prefer logging the object to preserve structure
    switch (level) {
      case "debug":
        logger.debug(payload);
        break;
      case "info":
        logger.info(payload);
        break;
      case "warn":
        logger.warn(payload);
        break;
      case "error":
        logger.error(payload);
        break;
      default:
        logger.debug(payload);
    }
  } catch (error) {
    try {
      const safe = JSON.stringify(payload);
      logger.error({ error: "trace_payload_unserializable", detail: safe, originalError: String(error) });
    } catch {
      logger.error({ error: "trace_payload_unserializable" });
    }
  }
}

function emitEvent(
  base: TraceContext,
  entry: { event: string; meta?: TraceEventMeta; level?: LogLevel; span?: SpanHandle; durationMs?: number }
) {
  const level = entry.level ?? "debug";
  const { meta, metaTruncated } = sanitizeMeta(entry.meta);
  const payload = {
    runId: base.runId,
    requestId: base.requestId,
    automationVersionId: base.automationVersionId,
    clientMessageId: base.clientMessageId,
    phase: base.phase,
    event: entry.event,
    meta,
    metaTruncated,
    level,
    source: base.source ?? "copilot",
    ts: new Date().toISOString(),
    durationMs: entry.durationMs,
    spanId: entry.span?.spanId,
    parentSpanId: entry.span?.parentSpanId,
  };
  logStructured(level, payload);
}

export function createCopilotTrace(context: TraceContext = {}): CopilotTrace {
  const enabled = DEBUG_ENABLED;

  const event = (eventName: string, meta?: TraceEventMeta, level?: LogLevel) => {
    if (!enabled) return;
    emitEvent(context, { event: eventName, meta, level });
  };

  const phase = (phaseName: string): CopilotTrace =>
    createCopilotTrace({ ...context, phase: phaseName });

  const spanStart = (spanName: string, meta?: TraceEventMeta): SpanHandle => {
    const span: SpanHandle = {
      spanId: crypto.randomUUID ? crypto.randomUUID() : `${Math.random()}`.slice(2),
      startedAt: Date.now(),
      name: spanName,
    };
    if (!enabled) return span;
    emitEvent(context, { event: `${spanName}.started`, meta, level: "debug", span });
    return span;
  };

  const spanEnd = (span: SpanHandle, meta?: TraceEventMeta, level?: LogLevel) => {
    if (!enabled) return;
    const durationMs = Math.max(0, Date.now() - span.startedAt);
    emitEvent(context, {
      event: `${span.name}.completed`,
      meta,
      level: level ?? "debug",
      span,
      durationMs,
    });
  };

  return { event, phase, spanStart, spanEnd, isEnabled: enabled };
}

export const defaultCopilotTrace = createCopilotTrace({ source: "copilot", phase: "run" });

// Exported for testing
export const __test = {
  sanitizeMeta,
  redactValue,
};

