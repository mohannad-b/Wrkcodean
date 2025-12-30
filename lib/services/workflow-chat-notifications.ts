/**
 * Notification service for workflow chat
 * Queues email notifications for users who are offline or haven't read messages
 */

import { db } from "@/db";
import { workflowMessages, workflowReadReceipts, users, memberships, automationVersions, automations } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { EmailService } from "@/lib/email/service";
import { logger } from "@/lib/logger";

type NotificationRecipient = {
  userId: string;
  email: string;
  name: string | null;
};

/**
 * Get users who should be notified about a new message
 */
async function getNotificationRecipients(params: {
  conversationId: string;
  workflowId: string;
  tenantId: string;
  excludeUserId: string; // Don't notify the sender
}): Promise<NotificationRecipient[]> {
  // Get all users with read access to this workflow
  // This includes workspace members with owner/admin/editor roles and Wrk staff
  const workflow = await db.query.automationVersions.findFirst({
    where: eq(automationVersions.id, params.workflowId),
  });

  if (!workflow) {
    return [];
  }

  // Get workspace members with chat access (owner/admin/editor)
  const members = await db
    .select({
      userId: memberships.userId,
      email: users.email,
      name: users.name,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(
      and(
        eq(memberships.tenantId, params.tenantId),
        eq(memberships.status, "active"),
        sql`${memberships.role} IN ('owner', 'admin', 'editor')`
      )
    );

  // Filter out sender and users who have read the message
  const recipients: NotificationRecipient[] = [];

  for (const member of members) {
    if (member.userId === params.excludeUserId) continue;

    // Check if user has read receipt indicating they've seen recent messages
    const receipt = await db.query.workflowReadReceipts.findFirst({
      where: and(
        eq(workflowReadReceipts.conversationId, params.conversationId),
        eq(workflowReadReceipts.userId, member.userId)
      ),
    });

    // If no receipt or receipt is old, user should be notified
    // For now, we'll notify if no receipt exists (user hasn't read thread)
    // In production, you'd check if receipt.lastReadMessageId is before the new message
    if (!receipt) {
      recipients.push({
        userId: member.userId,
        email: member.email,
        name: member.name,
      });
    }
  }

  return recipients;
}

/**
 * Queue email notification for new message
 */
export async function notifyNewMessage(params: {
  conversationId: string;
  workflowId: string;
  tenantId: string;
  messageId: string;
  senderUserId: string | null;
}): Promise<void> {
  try {
    const message = await db.query.workflowMessages.findFirst({
      where: eq(workflowMessages.id, params.messageId),
    });

    if (!message) {
      return;
    }

    // Don't notify for system messages
    if (message.senderType === "system") {
      return;
    }

    const workflow = await db.query.automationVersions.findFirst({
      where: eq(automationVersions.id, params.workflowId),
    });

    const automation = workflow
      ? await db.query.automations.findFirst({
          where: eq(automations.id, workflow.automationId),
        })
      : null;

    const recipients = await getNotificationRecipients({
      conversationId: params.conversationId,
      workflowId: params.workflowId,
      tenantId: params.tenantId,
      excludeUserId: params.senderUserId || "",
    });

    // Batch notifications (send one email per recipient)
    for (const recipient of recipients) {
      // Check user notification preferences
      const user = await db.query.users.findFirst({
        where: eq(users.id, recipient.userId),
      });

      if (user?.notificationPreference === "none") {
        continue;
      }

      // Queue email notification
      // In production, this would use a proper queue system
      // For now, we'll use the email service directly
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.wrkcopilot.com";
        await EmailService.sendNotification({
          templateId: "notification.workflow-chat-message",
          to: recipient.email,
          variables: {
            recipientName: recipient.name || recipient.email,
            workflowName: automation?.name || "Workflow",
            messagePreview: message.body.slice(0, 200),
            workflowUrl: `${appUrl}/automations/${params.workflowId}`,
            senderName: message.senderType === "wrk" ? "Wrk Team" : "Team Member",
            unsubscribeLink: `${appUrl}/settings/notifications`,
            privacyLink: "https://wrkcopilot.com/privacy",
            helpLink: "https://wrkcopilot.com/help",
            physicalAddress: "1250 Rene-Levesque West, Montreal, Quebec, Canada",
            year: new Date().getFullYear().toString(),
          },
          idempotencyKey: `chat-notification-${params.messageId}-${recipient.userId}`,
        });
    } catch (error) {
      logger.error(`Failed to send notification to ${recipient.email}:`, error);
        // Continue with other recipients
      }
    }
} catch (error) {
  logger.error("Failed to queue chat notifications:", error);
    // Don't throw - notifications are best-effort
  }
}

