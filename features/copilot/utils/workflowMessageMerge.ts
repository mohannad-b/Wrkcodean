import type { WorkflowMessage } from "@/features/copilot/ui/chat/types";

export function mergeWorkflowIncomingMessage(
  existing: WorkflowMessage[],
  incoming: WorkflowMessage,
  optimisticByClientId: Map<string, WorkflowMessage>
) {
  const exists = existing.some((m) => m.id === incoming.id || m.clientGeneratedId === incoming.clientGeneratedId);
  if (exists) return existing;

  if (incoming.clientGeneratedId) {
    const optimistic = optimisticByClientId.get(incoming.clientGeneratedId);
    if (optimistic) {
      optimisticByClientId.delete(incoming.clientGeneratedId);
      return existing.map((m) =>
        m.clientGeneratedId === incoming.clientGeneratedId ? { ...incoming, status: "sent" } : m
      );
    }
  }

  return [...existing, { ...incoming, status: "sent" }];
}
