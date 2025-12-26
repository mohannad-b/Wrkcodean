import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { getSubmissionDetail as getProjectDetail } from "@/lib/services/submissions";
import { getAutomationVersionDetail } from "@/lib/services/automations";
import { fromDbAutomationStatus } from "@/lib/automations/status";
import { fromDbQuoteStatus } from "@/lib/quotes/status";

type RouteParams = {
  params: {
    id: string;
  };
};

export async function GET(_request: Request, { params }: RouteParams) {
  console.warn("[DEPRECATION] /api/admin/projects/[id] is deprecated; use submissions.");
  try {
    const session = await requireTenantSession();

    const isAdmin = can(session, "admin:project:read", { type: "project", tenantId: session.tenantId });
    const canViewTenant = can(session, "automation:read", { type: "automation", tenantId: session.tenantId });
    if (!isAdmin && !canViewTenant) {
      throw new ApiError(403, "Forbidden");
    }

    const detail = await getProjectDetail(session.tenantId, params.id);

    if (detail) {
      return NextResponse.json({
        project: {
          id: detail.project.id,
          name: detail.project.name,
          status: fromDbAutomationStatus(detail.project.status),
          createdAt: detail.project.createdAt,
          updatedAt: detail.project.updatedAt,
          automation: detail.automation
            ? {
                id: detail.automation.id,
                name: detail.automation.name,
                description: detail.automation.description,
              }
            : null,
          version: detail.version
            ? {
                id: detail.version.id,
                versionLabel: detail.version.versionLabel,
                status: fromDbAutomationStatus(detail.version.status),
                intakeNotes: detail.version.intakeNotes,
                requirementsText: detail.version.requirementsText,
                intakeProgress: detail.version.intakeProgress,
                workflow: detail.version.workflowJson,
              }
            : null,
          quotes: detail.quotes.map((quote) => ({
            id: quote.id,
            status: fromDbQuoteStatus(quote.status),
            setupFee: quote.setupFee,
            unitPrice: quote.unitPrice,
            estimatedVolume: quote.estimatedVolume,
            clientMessage: quote.clientMessage,
          })),
          tasks:
            detail.tasks?.map((task) => ({
              id: task.id,
              title: task.title,
              status: task.status,
              priority: task.priority,
              dueDate: task.dueDate,
              assignee: task.assignee
                ? {
                    id: task.assignee.id,
                    name: task.assignee.name,
                    avatarUrl: task.assignee.avatarUrl,
                    title: task.assignee.title,
                  }
                : null,
            })) ?? [],
        },
      });
    }

    // Fallback: treat ID as an automation version ID (for automation requests without a project row).
    const versionDetail = await getAutomationVersionDetail(session.tenantId, params.id);
    if (!versionDetail) {
      throw new ApiError(404, "Project not found");
    }

    const latestQuote = versionDetail.latestQuote
      ? [
          {
            id: versionDetail.latestQuote.id,
            status: fromDbQuoteStatus(versionDetail.latestQuote.status),
            setupFee: versionDetail.latestQuote.setupFee,
            unitPrice: versionDetail.latestQuote.unitPrice,
            estimatedVolume: versionDetail.latestQuote.estimatedVolume,
            clientMessage: versionDetail.latestQuote.clientMessage,
          },
        ]
      : [];

    return NextResponse.json({
      project: {
        id: versionDetail.version.id,
        name: versionDetail.automation?.name ?? "Automation request",
        status: fromDbAutomationStatus(versionDetail.version.status),
        automation: versionDetail.automation
          ? {
              id: versionDetail.automation.id,
              name: versionDetail.automation.name,
              description: versionDetail.automation.description,
            }
          : null,
        version: {
          id: versionDetail.version.id,
          versionLabel: versionDetail.version.versionLabel,
          status: fromDbAutomationStatus(versionDetail.version.status),
          intakeNotes: versionDetail.version.intakeNotes,
          requirementsText: versionDetail.version.requirementsText,
          intakeProgress: versionDetail.version.intakeProgress,
          workflow: versionDetail.version.workflowJson,
        },
        quotes: latestQuote,
        tasks:
          versionDetail.tasks?.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
            assignee: null,
          })) ?? [],
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}


