import type { CopilotSseEvent, WorkflowChatEvent } from "@/features/copilot/ui/chat/types";

export function createSseClient(url: string) {
  return new EventSource(url);
}

export function normalizeCopilotSseEvent(
  rawEventType: string | null,
  payload: Record<string, unknown>,
  fallbackRunId: string
): CopilotSseEvent {
  const eventType = rawEventType?.trim() || "";
  const payloadEvent =
    typeof payload.event === "string" && payload.event.trim() ? payload.event.trim() : "";
  const payloadType = typeof payload.type === "string" && payload.type.trim() ? payload.type.trim() : "";
  const hasMessage = Boolean(payload.message);
  const effectiveType = eventType || payloadEvent || payloadType || (hasMessage ? "status" : "status");
  const runId = (payload.runId as string | undefined) ?? fallbackRunId;
  const isPing =
    effectiveType.toLowerCase() === "ping" || (payload && typeof payload === "object" && payload.ping === true);

  return {
    type: effectiveType,
    runId,
    payload,
    isPing,
  };
}

export function normalizeWorkflowChatEvent(event: MessageEvent): WorkflowChatEvent | null {
  if (!event?.data) return null;
  const parsed = JSON.parse(event.data) as WorkflowChatEvent;
  const payload = parsed.payload ?? parsed.data;

  return {
    ...parsed,
    payload,
  };
}
