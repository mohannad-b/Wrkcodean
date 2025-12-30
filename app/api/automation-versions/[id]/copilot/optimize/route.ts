import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { getAutomationVersionDetail } from "@/lib/services/automations";
import { sanitizeWorkflowTopology } from "@/lib/workflows/sanitizer";
import { applyStepNumbers } from "@/lib/workflows/step-numbering";
import { WorkflowSchema } from "@/lib/workflows/schema";
import { getWorkflowCompletionState } from "@/lib/workflows/completion";
import { automationVersions } from "@/db/schema";
import { db } from "@/db";
import { logAudit } from "@/lib/audit/log";
import { buildWorkflowViewModel } from "@/lib/workflows/view-model";
import { normalizeWorkflowInput, withLegacyWorkflowAlias } from "@/lib/workflows/legacy";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:metadata:update", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const detail = await getAutomationVersionDetail(session.tenantId, params.id);
    if (!detail) {
      throw new ApiError(404, "Automation version not found.");
    }

    const workflowSource = normalizeWorkflowInput(detail.version as any).workflowJson ?? null;
    const currentWorkflow = buildWorkflowViewModel(workflowSource).workflowSpec;
    if (!currentWorkflow) {
      throw new ApiError(400, "Workflow is empty.");
    }

    const { workflow: sanitizedWorkflow, summary } = sanitizeWorkflowTopology(currentWorkflow);
    const numbered = applyStepNumbers(sanitizedWorkflow);

    const validatedWorkflow = WorkflowSchema.parse({
      ...numbered,
      updatedAt: new Date().toISOString(),
    });

    const [savedVersion] = await db
      .update(automationVersions)
      .set({
        workflowJson: validatedWorkflow,
        updatedAt: new Date(),
      })
      .where(eq(automationVersions.id, params.id))
      .returning({ automationId: automationVersions.automationId });

    if (!savedVersion) {
      throw new ApiError(500, "Failed to save optimized workflow.");
    }

    revalidatePath(`/automations/${detail.automation?.id ?? savedVersion.automationId}`);

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.workflow.optimized",
      resourceType: "automation_version",
      resourceId: params.id,
      metadata: {
        source: "optimize_flow",
        versionLabel: detail.version.versionLabel,
        sanitizationSummary: summary,
      },
    });

    return NextResponse.json({
      ...withLegacyWorkflowAlias(validatedWorkflow),
      telemetry: {
        sanitizationSummary: summary,
      },
      completion: getWorkflowCompletionState(validatedWorkflow),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

