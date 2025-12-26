import { db } from "@/db";
import { auditLogs } from "@/db/schema";

const PLATFORM_TENANT_FALLBACK =
  process.env.PLATFORM_TENANT_ID ??
  process.env.WRK_TECH_TENANT_ID ??
  "00000000-0000-0000-0000-000000000000";

type AuditParams = {
  tenantId: string | null;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata?: Record<string, unknown>;
};

export async function logAudit(params: AuditParams) {
  try {
    const tenantId = params.tenantId ?? PLATFORM_TENANT_FALLBACK;
    await db.insert(auditLogs).values({
      tenantId,
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


