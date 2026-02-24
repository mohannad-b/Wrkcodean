/**
 * Rebuild workflow from requirements document.
 * Treats requirements as source of truth and generates a workflow that matches them.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { buildRateLimitKey, ensureRateLimit } from "@/lib/rate-limit";
import { getAutomationVersionDetail } from "@/lib/services/automations";
import { logAudit } from "@/lib/audit/log";
import { createEmptyWorkflowSpec } from "@/lib/workflows/factory";
import type { Workflow } from "@/lib/workflows/types";
import { WorkflowSchema } from "@/lib/workflows/schema";
import { getWorkflowCompletionState } from "@/lib/workflows/completion";
import { buildWorkflowFromChat } from "@/lib/workflows/ai-builder-simple";
import { applyStepNumbers } from "@/lib/workflows/step-numbering";
import { syncAutomationTasks } from "@/lib/workflows/task-sync";
import { db } from "@/db";
import { automationVersions } from "@/db/schema";
import { withLegacyWorkflowAlias } from "@/lib/workflows/legacy";
import { createEmptyCopilotAnalysisState } from "@/lib/workflows/copilot-analysis";
import { getCopilotAnalysis } from "@/lib/services/copilot-analysis";
import { logger } from "@/lib/logger";

const REBUILD_USER_MESSAGE =
  "Rebuild the workflow to match the requirements document exactly. Use the requirements as the source of truth. Include all steps, decisions, branches, and exceptions described. Preserve any existing step IDs where the step clearly corresponds to a requirement.";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:metadata:update", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    try {
      ensureRateLimit({
        key: buildRateLimitKey("copilot:rebuild", session.tenantId),
        limit: Number(process.env.COPILOT_REBUILDS_PER_HOUR ?? 10),
        windowMs: 60 * 60 * 1000,
      });
    } catch {
      throw new ApiError(429, "Too many rebuilds. Please wait before trying again.");
    }

    const detail = await getAutomationVersionDetail(session.tenantId, params.id);
    if (!detail) {
      throw new ApiError(404, "Automation version not found.");
    }

    const requirementsText = detail.version.requirementsText?.trim();
    if (!requirementsText || requirementsText.length < 20) {
      throw new ApiError(400, "Requirements document is too short or empty. Add more requirements before rebuilding.");
    }

    const currentWorkflow = detail.workflowView?.workflowSpec ?? createEmptyWorkflowSpec();
    const analysis = await getCopilotAnalysis({ tenantId: session.tenantId, automationVersionId: params.id });
    const analysisState = analysis ?? createEmptyCopilotAnalysisState();

    const result = await buildWorkflowFromChat({
      userMessage: REBUILD_USER_MESSAGE,
      currentBlueprint: currentWorkflow,
      currentWorkflow,
      conversationHistory: [],
      requirementsText,
      memorySummary: analysisState.memory?.summary_compact ?? null,
      memoryFacts: analysisState.memory?.facts ?? {},
      requirementsStatusHint: null,
      followUpMode: null,
      knownFactsHint: null,
    });

    const numberedWorkflow = applyStepNumbers(result.blueprint);
    const taskAssignments = await syncAutomationTasks({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      aiTasks: result.tasks,
      blueprint: numberedWorkflow,
      workflow: numberedWorkflow,
    });

    const workflowWithTasks: Workflow = {
      ...numberedWorkflow,
      steps: numberedWorkflow.steps.map((step) => ({
        ...step,
        taskIds: Array.from(new Set(taskAssignments[step.id] ?? step.taskIds ?? [])),
      })),
    };

    const validatedWorkflow = WorkflowSchema.parse({
      ...workflowWithTasks,
      updatedAt: new Date().toISOString(),
    });

    const [savedVersion] = await db
      .update(automationVersions)
      .set({
        workflowJson: validatedWorkflow,
        requirementsText: result.requirementsText ?? requirementsText,
        updatedAt: new Date(),
      })
      .where(eq(automationVersions.id, params.id))
      .returning({ automationId: automationVersions.automationId });

    if (!savedVersion) {
      throw new ApiError(500, "Failed to save rebuilt workflow.");
    }

    revalidatePath(`/automations/${detail.automation?.id ?? savedVersion.automationId}`);

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.workflow.rebuilt_from_requirements",
      resourceType: "automation_version",
      resourceId: params.id,
      metadata: {
        source: "rebuild_from_requirements",
        versionLabel: detail.version.versionLabel,
        stepCount: validatedWorkflow.steps?.length ?? 0,
        sanitizationSummary: result.sanitizationSummary,
      },
    });

    logger.info("[copilot:rebuild-from-requirements] Workflow rebuilt", {
      versionId: params.id,
      stepCount: validatedWorkflow.steps?.length ?? 0,
    });

    return NextResponse.json({
      ...withLegacyWorkflowAlias(validatedWorkflow),
      telemetry: {
        sanitizationSummary: result.sanitizationSummary,
      },
      completion: getWorkflowCompletionState(validatedWorkflow),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
