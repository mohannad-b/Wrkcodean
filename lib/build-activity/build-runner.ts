import { ApiError } from "@/lib/api/api-error";
import { getAutomationVersionDetail } from "@/lib/services/automations";
import { listCopilotMessages } from "@/lib/services/copilot-messages";
import { publishCopilotChatEvent } from "@/lib/copilot/chat-run-bus";
import type { BuildJobData } from "@/lib/build-activity/build-queue";

export type BuildRunnerInput = BuildJobData;

export async function runBuildPipeline(input: BuildRunnerInput) {
  const { automationVersionId, runId, payload, session } = input;
  const detail = await getAutomationVersionDetail(session.tenantId, automationVersionId);
  if (!detail) {
    throw new ApiError(404, "Automation version not found.");
  }

  // Stale-job skip: if a newer user message exists, skip heavy work and publish superseded
  const userMessageId = (payload as { userMessageId?: string }).userMessageId;
  if (userMessageId) {
    const messages = await listCopilotMessages({
      tenantId: session.tenantId,
      automationVersionId,
    });
    const latestUserMessage = [...messages].reverse().find((m) => m.role === "user");
    if (latestUserMessage && latestUserMessage.id !== userMessageId) {
      console.log("[build-worker] skipping stale job", {
        runId,
        jobUserMessageId: userMessageId,
        latestUserMessageId: latestUserMessage.id,
      });
      await publishCopilotChatEvent(runId, {
        type: "superseded",
        payload: {
          runId,
          message: "A newer message was sent. The workflow will update when that build completes.",
        },
      });
      return;
    }
  }

  try {
    const { runCopilotChat } = await import("@/app/api/automation-versions/[id]/copilot/chat/route");
    const chatReplyHandledByApi = Boolean((payload as { chatReplyHandledByApi?: boolean }).chatReplyHandledByApi);
    return await runCopilotChat({
      request: new Request("http://localhost"),
      params: { id: automationVersionId },
      payload,
      session: session as any,
      detail,
      callbacks: {
        onStatus: (status) => void publishCopilotChatEvent(runId, { type: "status", payload: status as any }),
        onResult: (result) => void publishCopilotChatEvent(runId, { type: "result", payload: result as any }),
        onError: (err) => void publishCopilotChatEvent(runId, { type: "error", payload: err as any }),
        onMessage: (p) => void publishCopilotChatEvent(runId, { type: "message", payload: p as any }),
        onWorkflowUpdate: (p) => void publishCopilotChatEvent(runId, { type: "workflow_update", payload: p as any }),
        onTasksUpdate: (p) => void publishCopilotChatEvent(runId, { type: "tasks_update", payload: p as any }),
        onRequirementsUpdate: (p) => void publishCopilotChatEvent(runId, { type: "requirements_update", payload: p as any }),
      },
      runIdOverride: runId,
      skipChatReply: chatReplyHandledByApi,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const code = error instanceof ApiError ? error.status : undefined;
    await publishCopilotChatEvent(runId, {
      type: "error",
      payload: { runId, requestId: "worker", message, code },
    });
    throw error;
  }
}
