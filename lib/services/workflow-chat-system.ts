/**
 * Helper functions for creating system messages
 */

import { getOrCreateConversation, createMessage } from "./workflow-chat";
import { emitChatEvent } from "@/lib/realtime/events";

export async function createSystemMessage(params: {
  tenantId: string;
  automationVersionId: string;
  body: string;
}): Promise<void> {
  const conversation = await getOrCreateConversation({
    tenantId: params.tenantId,
    automationVersionId: params.automationVersionId,
  });

  await createMessage({
    conversationId: conversation.id,
    tenantId: params.tenantId,
    automationVersionId: params.automationVersionId,
    senderType: "system",
    senderUserId: null,
    body: params.body,
    attachments: [],
  });
}

/**
 * Create system message when workflow status changes
 */
export async function notifyWorkflowStatusChange(params: {
  tenantId: string;
  automationVersionId: string;
  oldStatus: string;
  newStatus: string;
}): Promise<void> {
  const statusMessages: Record<string, string> = {
    NeedsPricing: "Workflow moved to Needs Pricing",
    AwaitingClientApproval: "Workflow awaiting client approval",
    ReadyForBuild: "Workflow ready for build",
    BuildInProgress: "Build started",
    QATesting: "Workflow moved to QA Testing",
    Live: "Workflow is now Live",
    Archived: "Workflow archived",
  };

  const message = statusMessages[params.newStatus] || `Workflow status changed to ${params.newStatus}`;
  await createSystemMessage({
    tenantId: params.tenantId,
    automationVersionId: params.automationVersionId,
    body: message,
  });
}

/**
 * Create system message when task is assigned
 */
export async function notifyTaskAssigned(params: {
  tenantId: string;
  automationVersionId: string;
  taskTitle: string;
  assigneeName: string;
}): Promise<void> {
  await createSystemMessage({
    tenantId: params.tenantId,
    automationVersionId: params.automationVersionId,
    body: `Task "${params.taskTitle}" assigned to ${params.assigneeName}`,
  });
}

/**
 * Create system message when workflow is assigned to Wrk team member
 */
export async function notifyWorkflowAssigned(params: {
  tenantId: string;
  automationVersionId: string;
  assigneeName: string;
}): Promise<void> {
  await createSystemMessage({
    tenantId: params.tenantId,
    automationVersionId: params.automationVersionId,
    body: `Workflow assigned to ${params.assigneeName}`,
  });
}

