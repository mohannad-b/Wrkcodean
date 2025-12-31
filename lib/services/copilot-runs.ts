import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { copilotRuns } from "@/db/schema";

type GetParams = {
  tenantId: string;
  automationVersionId: string;
  clientMessageId: string;
};

type CreateParams = GetParams & {
  userMessageId: string;
  assistantMessageId: string;
};

function isUniqueConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("duplicate key value") || (error as { code?: string })?.code === "23505";
}

export async function getCopilotRunByClientMessageId(params: GetParams) {
  const [existing] = await db
    .select()
    .from(copilotRuns)
    .where(
      and(
        eq(copilotRuns.tenantId, params.tenantId),
        eq(copilotRuns.automationVersionId, params.automationVersionId),
        eq(copilotRuns.clientMessageId, params.clientMessageId)
      )
    )
    .limit(1);

  return existing ?? null;
}

export async function createCopilotRun(params: CreateParams) {
  try {
    const [inserted] = await db
      .insert(copilotRuns)
      .values({
        tenantId: params.tenantId,
        automationVersionId: params.automationVersionId,
        clientMessageId: params.clientMessageId,
        userMessageId: params.userMessageId,
        assistantMessageId: params.assistantMessageId,
      })
      .returning();

    return inserted ?? null;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return getCopilotRunByClientMessageId(params);
    }
    throw error;
  }
}

