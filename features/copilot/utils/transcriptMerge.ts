import type { CopilotMessage } from "@/features/copilot/types";

export function mergeTranscript(
  existing: CopilotMessage[],
  incoming: CopilotMessage[],
  fallbackMessage: CopilotMessage
) {
  const byId = new Map<string, CopilotMessage>();
  const byClient = new Map<string, CopilotMessage>();
  existing.forEach((m) => {
    if (m.clientMessageId) byClient.set(m.clientMessageId, m);
    byId.set(m.id, m);
  });

  incoming.forEach((m) => {
    if (m.clientMessageId && byClient.has(m.clientMessageId)) {
      byId.delete(byClient.get(m.clientMessageId)!.id);
    } else if (m.clientMessageId) {
      byClient.set(m.clientMessageId, m);
    }

    if (!m.clientMessageId && m.role === "user") {
      const optimistic = existing.find(
        (msg) =>
          msg.optimistic &&
          msg.role === "user" &&
          msg.content.trim() === m.content.trim() &&
          Math.abs(new Date(msg.createdAt).getTime() - new Date(m.createdAt).getTime()) < 15_000
      );
      if (optimistic) {
        byId.delete(optimistic.id);
      }
    }

    byId.set(m.id, m);
  });

  const merged = Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return merged.length ? merged : [fallbackMessage];
}
