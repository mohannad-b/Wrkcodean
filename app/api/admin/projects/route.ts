import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { listAutomationRequestsForTenant, listProjectsForTenant } from "@/lib/services/projects";
import { fromDbAutomationStatus } from "@/lib/automations/status";
import { fromDbQuoteStatus } from "@/lib/quotes/status";
import { db } from "@/db";
import { automationVersions } from "@/db/schema";
import { ensureProjectForVersion } from "@/lib/services/automations";

type CreateProjectPayload = {
  automationId?: unknown;
  automationVersionId?: unknown;
};

async function parsePayload(request: Request): Promise<CreateProjectPayload> {
  try {
    return (await request.json()) as CreateProjectPayload;
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    const session = await requireTenantSession();

    const isAdmin = can(session, "admin:project:read");
    const canViewTenant = can(session, "automation:read", { type: "automation", tenantId: session.tenantId });
    if (!isAdmin && !canViewTenant) {
      throw new ApiError(403, "Forbidden");
    }

    const items = await listProjectsForTenant(session.tenantId);
    const seenVersionIds = new Set(items.map((item) => item.version?.id).filter(Boolean) as string[]);
    const requests = await listAutomationRequestsForTenant(session.tenantId, seenVersionIds);
    const combined = [...items, ...requests];

    return NextResponse.json({
      projects: combined.map((item) => ({
        id: item.project.id,
        name: item.project.name,
        status: fromDbAutomationStatus(item.project.status),
        updatedAt: item.project.updatedAt,
        automation: item.automation
          ? {
              id: item.automation.id,
              name: item.automation.name,
            }
          : null,
        version: item.version
          ? {
              id: item.version.id,
              versionLabel: item.version.versionLabel,
              status: fromDbAutomationStatus(item.version.status),
            }
          : null,
        latestQuote: item.latestQuote
          ? {
              id: item.latestQuote.id,
              status: fromDbQuoteStatus(item.latestQuote.status),
            }
          : null,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "admin:project:write")) {
      throw new ApiError(403, "Forbidden");
    }

    const payload = await parsePayload(request);
    const automationVersionId = typeof payload.automationVersionId === "string" ? payload.automationVersionId : "";

    if (!automationVersionId) {
      throw new ApiError(400, "automationVersionId is required");
    }

    const versionRow = await db
      .select()
      .from(automationVersions)
      .where(and(eq(automationVersions.id, automationVersionId), eq(automationVersions.tenantId, session.tenantId)))
      .limit(1);

    if (versionRow.length === 0) {
      throw new ApiError(404, "Automation version not found");
    }

    if (payload.automationId && payload.automationId !== versionRow[0].automationId) {
      throw new ApiError(400, "automationId does not match version");
    }

    const project = await ensureProjectForVersion(versionRow[0]);

    return NextResponse.json(
      {
        project: {
          id: project.id,
          status: fromDbAutomationStatus(project.status),
          automationId: project.automationId,
          automationVersionId: project.automationVersionId,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}


