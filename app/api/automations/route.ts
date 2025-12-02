import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { handleApiError, requireTenantSession, ApiError } from "@/lib/api/context";
import { listAutomationsForTenant, createAutomationWithInitialVersion } from "@/lib/services/automations";
import { fromDbAutomationStatus } from "@/lib/automations/status";
import { fromDbQuoteStatus } from "@/lib/quotes/status";
import { logAudit } from "@/lib/audit/log";

type CreateAutomationPayload = {
  name?: unknown;
  description?: unknown;
  intakeNotes?: unknown;
};

async function parsePayload(request: Request): Promise<CreateAutomationPayload> {
  try {
    return (await request.json()) as CreateAutomationPayload;
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:read", { type: "automation", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const rows = await listAutomationsForTenant(session.tenantId);

    return NextResponse.json({
      automations: rows.map((automation) => ({
        id: automation.id,
        name: automation.name,
        description: automation.description,
        createdAt: automation.createdAt,
        updatedAt: automation.updatedAt,
        latestVersion: automation.latestVersion
          ? {
              id: automation.latestVersion.id,
              versionLabel: automation.latestVersion.versionLabel,
              status: fromDbAutomationStatus(automation.latestVersion.status),
              intakeNotes: automation.latestVersion.intakeNotes,
              summary: automation.latestVersion.summary,
              updatedAt: automation.latestVersion.updatedAt,
              latestQuote: automation.latestVersion.latestQuote
                ? {
                    id: automation.latestVersion.latestQuote.id,
                    status: fromDbQuoteStatus(automation.latestVersion.latestQuote.status),
                    setupFee: automation.latestVersion.latestQuote.setupFee,
                    unitPrice: automation.latestVersion.latestQuote.unitPrice,
                    updatedAt: automation.latestVersion.latestQuote.updatedAt,
                  }
                : null,
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

    if (!can(session, "automation:create", { type: "automation", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const payload = await parsePayload(request);
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const description =
      typeof payload.description === "string" && payload.description.trim().length > 0
        ? payload.description.trim()
        : null;
    const intakeNotes =
      typeof payload.intakeNotes === "string" && payload.intakeNotes.trim().length > 0
        ? payload.intakeNotes.trim()
        : null;

    if (!name) {
      throw new ApiError(400, "name is required");
    }

    const { automation, version } = await createAutomationWithInitialVersion({
      tenantId: session.tenantId,
      userId: session.userId,
      name,
      description,
      intakeNotes,
    });

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.create",
      resourceType: "automation",
      resourceId: automation.id,
      metadata: { versionId: version.id },
    });

    return NextResponse.json(
      {
        automation: {
          id: automation.id,
          name: automation.name,
          description: automation.description,
          createdAt: automation.createdAt,
          version: {
            id: version.id,
            versionLabel: version.versionLabel,
            status: fromDbAutomationStatus(version.status),
            intakeNotes: version.intakeNotes,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}


