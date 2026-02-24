import type { ApiCopilotMessage } from "@/features/copilot/hooks/copilotChatTypes";
import type { CopilotMessage } from "@/features/copilot/types";

export type BuildActivityUpdate = {
  phase?: string;
  rawPhase?: string | null;
  lastSeq?: number | null;
  message?: string | null;
  isRunning?: boolean;
  completedAt?: number | null;
  startedAt?: number | null;
};

export type StudioSseEventResult =
  | { kind: "ignore"; runId: string; seq?: number }
  | { kind: "progress"; runId: string; seq?: number; update: BuildActivityUpdate; lineText: string }
  | { kind: "message"; runId: string; seq?: number; message: ApiCopilotMessage }
  | { kind: "error"; runId: string; seq?: number; update: BuildActivityUpdate; message: string }
  | { kind: "result"; runId: string; seq?: number }
  | { kind: "superseded"; runId: string; seq?: number; message?: string }
  | { kind: "workflow_update"; runId: string; seq?: number; workflow: unknown }
  | { kind: "tasks_update"; runId: string; seq?: number; tasks: unknown[] }
  | { kind: "requirements_update"; runId: string; seq?: number; requirementsText: string };

export function extractProgressLine(payload: Record<string, unknown>): string {
  const candidates = [payload?.message, payload?.line, payload?.text, payload?.status, payload?.detail];
  const picked = candidates.find((v) => typeof v === "string" && v.trim().length > 0);
  return (picked ?? "").toString().trim();
}

export function getProgressPhase(payload: Record<string, unknown>, effectiveType?: string) {
  const rawPhase =
    typeof payload?.phase === "string" && payload.phase.trim()
      ? payload.phase.trim()
      : effectiveType && effectiveType.trim()
      ? effectiveType.trim()
      : "working";
  return rawPhase;
}

export function getProgressActivityUpdate(
  payload: Record<string, unknown>,
  effectiveType: string | undefined,
  seq: number | null,
  lineText: string
): BuildActivityUpdate | null {
  if (!lineText && !payload?.phase) return null;
  const phase = getProgressPhase(payload, effectiveType);
  const isTerminal = phase.toLowerCase() === "done" || phase.toLowerCase() === "error";
  return {
    phase,
    rawPhase: (payload?.phase as string | undefined) ?? phase,
    lastSeq: seq,
    message: lineText || null,
    isRunning: !isTerminal,
    completedAt: isTerminal ? Date.now() : null,
  };
}

export function getErrorActivityUpdate(message: string, seq?: number | null): BuildActivityUpdate {
  return {
    phase: "error",
    rawPhase: "error",
    lastSeq: seq ?? null,
    message: message.trim() || null,
    isRunning: false,
    completedAt: Date.now(),
  };
}

export function getResultActivityUpdate(stepCount: number): BuildActivityUpdate {
  const finalPhase = stepCount === 0 ? "error" : "done";
  return {
    phase: finalPhase,
    rawPhase: finalPhase,
    isRunning: false,
    completedAt: Date.now(),
  };
}

export function toAssistantMessage(
  apiMessage: ApiCopilotMessage,
  mapMessage: (message: ApiCopilotMessage) => CopilotMessage
) {
  return mapMessage(apiMessage);
}

export function reduceStudioSseEvent(
  eventType: string,
  payload: Record<string, unknown>,
  runId: string
): StudioSseEventResult {
  const seq = typeof payload?.seq === "number" ? payload.seq : undefined;
  if (eventType === "message") {
    const message = payload?.message as ApiCopilotMessage | undefined;
    if (!message) return { kind: "ignore", runId, seq };
    return { kind: "message", runId, seq, message };
  }
  if (eventType === "result") {
    return { kind: "result", runId, seq };
  }
  if (eventType === "workflow_update") {
    const workflow = payload?.workflow;
    if (workflow == null) return { kind: "ignore", runId, seq };
    return { kind: "workflow_update", runId, seq, workflow };
  }
  if (eventType === "tasks_update") {
    const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
    return { kind: "tasks_update", runId, seq, tasks };
  }
  if (eventType === "requirements_update") {
    const requirementsText = typeof payload?.requirementsText === "string" ? payload.requirementsText : "";
    return { kind: "requirements_update", runId, seq, requirementsText };
  }
  if (eventType === "error") {
    const message = (payload?.message as string | undefined) ?? "";
    return { kind: "error", runId, seq, update: getErrorActivityUpdate(message, seq), message };
  }
  if (eventType === "superseded") {
    return { kind: "superseded", runId, seq, message: payload?.message as string | undefined };
  }

  const lineText = extractProgressLine(payload);
  const update = getProgressActivityUpdate(payload, eventType, seq ?? null, lineText);
  if (!update) return { kind: "ignore", runId, seq };
  return { kind: "progress", runId, seq, update, lineText };
}
