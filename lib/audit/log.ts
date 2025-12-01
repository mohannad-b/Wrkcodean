import { db } from "@/db";
import { auditLogs } from "@/db/schema";

type AuditParams = {
  tenantId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
};

export async function logAudit(params: AuditParams) {
  try {
    await db.insert(auditLogs).values({
      tenantId: params.tenantId,
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      metadata: params.metadata ?? null,
    });
  } catch (error) {
    console.warn("[audit] failed to log audit entry", error);
  }
}


