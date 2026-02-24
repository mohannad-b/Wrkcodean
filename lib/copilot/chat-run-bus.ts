import { redisPublish, redisSubscribe } from "@/lib/realtime/redis-bus";

const CHANNEL_PREFIX = "copilot:chat:run:";

export type CopilotChatEvent =
  | { type: "status"; payload: Record<string, unknown> }
  | { type: "message"; payload: Record<string, unknown> }
  | { type: "result"; payload: Record<string, unknown> }
  | { type: "error"; payload: Record<string, unknown> }
  | { type: "workflow_update"; payload: Record<string, unknown> }
  | { type: "tasks_update"; payload: Record<string, unknown> }
  | { type: "requirements_update"; payload: Record<string, unknown> }
  | { type: "superseded"; payload: { runId: string; message?: string } };

function channelForRun(runId: string) {
  return `${CHANNEL_PREFIX}${runId}`;
}

export async function publishCopilotChatEvent(runId: string, event: CopilotChatEvent): Promise<void> {
  await redisPublish(channelForRun(runId), event);
}

export async function subscribeCopilotChatEvents(
  runId: string,
  handler: (event: CopilotChatEvent) => void
): Promise<() => Promise<void>> {
  return redisSubscribe<CopilotChatEvent>(channelForRun(runId), handler);
}
