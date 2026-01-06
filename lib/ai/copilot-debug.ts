import { createCopilotTrace, defaultCopilotTrace } from "@/lib/ai/copilot-trace";

const TRACE_ENABLED = process.env.DEBUG_COPILOT_LOGS === "true";

function sanitize(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 800 ? `${value.slice(0, 800)}…` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map(sanitize);
  }
  if (value && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      copy[k] = sanitize(v);
    });
    return copy;
  }
  return value;
}

export function copilotDebug(message: string, payload?: unknown) {
  if (!TRACE_ENABLED) return;
  defaultCopilotTrace.event(message, payload ? { payload: sanitize(payload) } : undefined, "debug");
}

export function createCopilotDebugTrace(context: { runId?: string; messageId?: string; phase?: string; source?: string } = {}) {
  if (!TRACE_ENABLED) {
    return {
      event: () => {},
      phase: () => createCopilotDebugTrace(context),
      startSpan: () => ({ spanId: "", event: () => {}, phase: () => createCopilotDebugTrace(context), endSpan: () => {} }),
      isEnabled: false,
    };
  }
  return createCopilotTrace({ ...context, source: context.source ?? "copilot" });
}

