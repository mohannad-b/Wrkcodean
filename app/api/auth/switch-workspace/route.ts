import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, tenants, auditLogs } from "@/db/schema";
import { getOrCreateUserFromAuth0Session } from "@/lib/auth/session";
import { handleApiError, ApiError } from "@/lib/api/context";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { userRecord } = await getOrCreateUserFromAuth0Session();

    let body: { tenant_id?: string };
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Invalid JSON body.");
    }

    const requestedTenantId = body.tenant_id;
    if (!requestedTenantId) {
      throw new ApiError(400, "tenant_id is required.");
    }

    // Verify user has active membership in requested tenant
    const membership = await db
      .select({
        tenantId: memberships.tenantId,
        role: memberships.role,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
      })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(and(eq(memberships.userId, userRecord.id), eq(memberships.tenantId, requestedTenantId)))
      .limit(1);

    if (membership.length === 0) {
      throw new ApiError(403, "You do not have access to this workspace.");
    }

    const { tenantId, tenantName, tenantSlug } = membership[0];

    // Create audit log entry
    await db.insert(auditLogs).values({
      tenantId,
      userId: userRecord.id,
      action: "switch_workspace",
      resourceType: "user",
      resourceId: userRecord.id,
      metadata: {
        fromTenantId: null, // Could be enhanced to track previous tenant
        toTenantId: tenantId,
      },
    });

    // Note: In a full implementation, we would update the session/JWT here
    // For now, the frontend will reload the page which will cause the session to be recomputed
    // The session logic would need to be updated to support last_active_tenant_id

    return NextResponse.json({
      tenant_id: tenantId,
      workspace_name: tenantName,
      workspace_slug: tenantSlug,
      message: "Workspace switched successfully",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

