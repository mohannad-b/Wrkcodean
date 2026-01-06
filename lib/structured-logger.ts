type LogLevel = "debug" | "info" | "warn" | "error";

export type StructuredLogEvent = {
  runId?: string;
  messageId?: string;
  phase?: string;
  event: string;
  meta?: Record<string, unknown>;
  level?: LogLevel;
  source?: string;
  timestamp: string;
  spanId?: string;
  parentSpanId?: string;
};

type LoggerContext = {
  runId?: string;
  messageId?: string;
  phase?: string;
  source?: string;
  meta?: Record<string, unknown>;
  level?: LogLevel;
  spanId?: string;
  parentSpanId?: string;
};

type EventInput = Omit<StructuredLogEvent, "timestamp">;

type SpanHandle = {
  spanId: string;
  event: (entry: EventInput) => StructuredLogEvent;
  phase: (phaseName: string) => StructuredLogger;
  endSpan: (meta?: Record<string, unknown>, level?: LogLevel) => StructuredLogEvent;
};

export type StructuredLogger = {
  event: (entry: EventInput) => StructuredLogEvent;
  phase: (phaseName: string) => StructuredLogger;
  startSpan: (spanName: string, meta?: Record<string, unknown>) => SpanHandle;
};

const FALLBACK_LEVEL: LogLevel = "info";

function nowIso(): string {
  return new Date().toISOString();
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Browser-safe fallback
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

function resolveConsole(level: LogLevel) {
  if (typeof console === "undefined") {
    return () => {};
  }
  switch (level) {
    case "debug":
      return console.debug ? console.debug.bind(console) : console.log.bind(console);
    case "info":
      return console.info ? console.info.bind(console) : console.log.bind(console);
    case "warn":
      return console.warn ? console.warn.bind(console) : console.log.bind(console);
    case "error":
      return console.error ? console.error.bind(console) : console.log.bind(console);
    default:
      return console.log.bind(console);
  }
}

function emitStructuredEvent(base: LoggerContext, entry: EventInput): StructuredLogEvent {
  const level = entry.level ?? base.level ?? FALLBACK_LEVEL;
  const payload: StructuredLogEvent = {
    runId: entry.runId ?? base.runId,
    messageId: entry.messageId ?? base.messageId,
    phase: entry.phase ?? base.phase,
    event: entry.event,
    meta: { ...(base.meta ?? {}), ...(entry.meta ?? {}) },
    level,
    source: entry.source ?? base.source,
    timestamp: nowIso(),
    spanId: entry.spanId ?? base.spanId,
    parentSpanId: entry.parentSpanId ?? base.parentSpanId,
  };

  const logFn = resolveConsole(level);
  logFn("[event]", payload);
  return payload;
}

export function createStructuredLogger(base: LoggerContext = {}): StructuredLogger {
  const event = (entry: EventInput) => emitStructuredEvent(base, entry);

  const phase = (phaseName: string): StructuredLogger =>
    createStructuredLogger({ ...base, phase: phaseName });

  const startSpan = (spanName: string, meta?: Record<string, unknown>): SpanHandle => {
    const spanId = generateId();
    const spanContext: LoggerContext = {
      ...base,
      spanId,
      parentSpanId: base.spanId,
    };

    emitStructuredEvent(spanContext, {
      event: spanName,
      meta: { ...(meta ?? {}), span: "start" },
      level: base.level,
      phase: base.phase,
    });

    const endSpan = (endMeta?: Record<string, unknown>, level?: LogLevel) =>
      emitStructuredEvent(spanContext, {
        event: spanName,
        meta: { ...(meta ?? {}), ...(endMeta ?? {}), span: "end" },
        level: level ?? base.level,
        phase: base.phase,
      });

    return {
      spanId,
      endSpan,
      event: (entry: EventInput) => emitStructuredEvent(spanContext, entry),
      phase: (phaseName: string) => createStructuredLogger({ ...spanContext, phase: phaseName }),
    };
  };

  return { event, phase, startSpan };
}

// Convenience top-level helpers with no preset context
export const structuredEvent = (entry: EventInput) => createStructuredLogger().event(entry);
export const structuredPhase = (phaseName: string) => createStructuredLogger({ phase: phaseName });
export const startStructuredSpan = (spanName: string, meta?: Record<string, unknown>) =>
  createStructuredLogger().startSpan(spanName, meta);

