import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  automationVersions,
  copilotMessages,
  type CopilotMessage,
  type CopilotMessageRole,
} from "@/db/schema";

type ListParams = {
  tenantId: string;
  automationVersionId: string;
};

type CreateParams = {
  tenantId: string;
  automationVersionId: string;
  role: CopilotMessageRole;
  content: string;
  createdBy?: string | null;
};

async function ensureAutomationVersionAccess(tenantId: string, automationVersionId: string) {
  const [row] = await db
    .select({ id: automationVersions.id })
    .from(automationVersions)
    .where(and(eq(automationVersions.id, automationVersionId), eq(automationVersions.tenantId, tenantId)))
    .limit(1);

  if (!row) {
    throw new Error("Automation version not found");
  }
}

export async function listCopilotMessages(params: ListParams): Promise<CopilotMessage[]> {
  await ensureAutomationVersionAccess(params.tenantId, params.automationVersionId);

  return db
    .select()
    .from(copilotMessages)
    .where(
      and(eq(copilotMessages.tenantId, params.tenantId), eq(copilotMessages.automationVersionId, params.automationVersionId))
    )
    .orderBy(asc(copilotMessages.createdAt));
}

export async function createCopilotMessage(params: CreateParams): Promise<CopilotMessage> {
  await ensureAutomationVersionAccess(params.tenantId, params.automationVersionId);

  const [inserted] = await db
    .insert(copilotMessages)
    .values({
      tenantId: params.tenantId,
      automationVersionId: params.automationVersionId,
      role: params.role,
      content: params.content,
      createdBy: params.createdBy ?? null,
    })
    .returning();

  if (!inserted) {
    throw new Error("Failed to create Copilot message");
  }

  return inserted;
}

