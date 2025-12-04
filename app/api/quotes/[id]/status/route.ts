import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { parseQuoteStatus, fromDbQuoteStatus } from "@/lib/quotes/status";
import { fromDbAutomationStatus } from "@/lib/automations/status";
import { updateQuoteStatus, signQuoteAndPromote } from "@/lib/services/projects";
import { db } from "@/db";
import { quotes } from "@/db/schema";
import { logAudit } from "@/lib/audit/log";
import { updateAutomationVersionStatus } from "@/lib/services/automations";

type RouteParams = {
  params: {
    id: string;
  };
};

type StatusPayload = {
  status?: unknown;
};

async function parsePayload(request: Request): Promise<StatusPayload> {
  try {
    return (await request.json()) as StatusPayload;
  } catch {
    return {};
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "admin:quote:update")) {
      throw new ApiError(403, "Forbidden");
    }

    const payload = await parsePayload(request);
    const nextStatus = parseQuoteStatus(payload.status);

    if (!nextStatus) {
      throw new ApiError(400, "Invalid status");
    }

    const quoteRows = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, params.id), eq(quotes.tenantId, session.tenantId)))
      .limit(1);

    if (quoteRows.length === 0) {
      throw new ApiError(404, "Quote not found");
    }

    if (nextStatus === "SIGNED") {
      const result = await signQuoteAndPromote({
        tenantId: session.tenantId,
        quoteId: params.id,
      }).catch((error: unknown) => {
        if (error instanceof Error) {
          if (error.message.includes("Quote not found")) {
            throw new ApiError(404, error.message);
          }
          if (error.message.includes("must be SENT")) {
            throw new ApiError(400, error.message);
          }
        }
        throw error;
      });

      await logAudit({
        tenantId: session.tenantId,
        userId: session.userId,
        action: "automation.quote.accepted",
        resourceType: "quote",
        resourceId: params.id,
        metadata: {
          quoteStatus: { from: result.previousQuoteStatus, to: "SIGNED" },
          automationVersionId: result.automationVersion?.id ?? null,
          automationStatus: result.previousAutomationStatus
            ? { from: result.previousAutomationStatus, to: result.automationVersion ? fromDbAutomationStatus(result.automationVersion.status) : null }
            : null,
          projectId: result.project?.id ?? null,
          projectStatus: result.previousProjectStatus
            ? { from: result.previousProjectStatus, to: result.project ? fromDbAutomationStatus(result.project.status) : null }
            : null,
        },
      });

      return NextResponse.json({
        quote: {
          id: result.quote.id,
          status: fromDbQuoteStatus(result.quote.status),
        },
        automationVersion: result.automationVersion
          ? {
              id: result.automationVersion.id,
              status: fromDbAutomationStatus(result.automationVersion.status),
            }
          : null,
        project: result.project
          ? {
              id: result.project.id,
              status: fromDbAutomationStatus(result.project.status),
            }
          : null,
      });
    }

    const updated = await updateQuoteStatus({
      tenantId: session.tenantId,
      quoteId: params.id,
      nextStatus,
    }).catch((error: unknown) => {
      if (error instanceof Error) {
        if (error.message.includes("Quote not found")) {
          throw new ApiError(404, error.message);
        }
        if (error.message.includes("Invalid quote transition")) {
          throw new ApiError(400, error.message);
        }
      }
      throw error;
    });

    if (nextStatus === "SENT") {
      const versionId = quoteRows[0].automationVersionId;
      if (versionId) {
        const { previousStatus } = await updateAutomationVersionStatus({
          tenantId: session.tenantId,
          automationVersionId: versionId,
          nextStatus: "AwaitingClientApproval",
        }).catch((error: unknown) => {
          if (error instanceof Error && error.message.includes("Invalid status transition")) {
            throw new ApiError(400, error.message);
          }
          throw error;
        });

        await logAudit({
          tenantId: session.tenantId,
          userId: session.userId,
          action: "automation.version.status.changed",
          resourceType: "automation_version",
          resourceId: versionId,
          metadata: { from: previousStatus, to: "AwaitingClientApproval", source: "quote.sent" },
        });
      }
    }
    const statusAction =
      nextStatus === "SENT"
        ? "automation.quote.sent"
        : nextStatus === "REJECTED"
        ? "automation.quote.rejected"
        : "automation.quote.generated";

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: statusAction,
      resourceType: "quote",
      resourceId: params.id,
      metadata: { status: nextStatus },
    });

    return NextResponse.json({
      quote: {
        id: updated.id,
        status: fromDbQuoteStatus(updated.status),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}


