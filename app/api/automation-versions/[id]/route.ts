import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import {
  deleteAutomationVersion,
  getAutomationVersionDetail,
  updateAutomationVersionMetadata,
  type UpdateMetadataParams,
} from "@/lib/services/automations";
import { logAudit } from "@/lib/audit/log";
import { fromDbAutomationStatus } from "@/lib/automations/status";
import { fromDbQuoteStatus } from "@/lib/quotes/status";
import { WorkflowSchema } from "@/lib/workflows/schema";
import type { Workflow } from "@/lib/workflows/types";
import { diffWorkflow } from "@/lib/workflows/diff";
import { normalizeWorkflowInput, withLegacyWorkflowAlias } from "@/lib/workflows/legacy";
import type { Task } from "@/db/schema";
import { buildWorkflowViewModel } from "@/lib/workflows/view-model";
import { sendDevAgentLog } from "@/lib/dev/agent-log";
import { logger } from "@/lib/logger";

type RouteParams = {
  params: {
    id: string;
  };
};

type UpdatePayload = {
  automationName?: unknown;
  automationDescription?: unknown;
  businessOwner?: unknown;
  tags?: unknown;
  intakeNotes?: unknown;
  requirementsText?: unknown;
  workflowJson?: unknown;
};

function validateIntakeNotes(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "intakeNotes must be a string.");
  }
  if (value.length > 20000) {
    throw new ApiError(400, "intakeNotes must be 20k characters or fewer.");
  }
  return value;
}

function validateRequirementsText(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "requirementsText must be a string.");
  }
  if (value.length > 50000) {
    throw new ApiError(400, "requirementsText must be 50k characters or fewer.");
  }
  return value;
}

function validateWorkflow(value: unknown): Workflow | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const result = WorkflowSchema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid workflow_json payload.";
    throw new ApiError(400, message);
  }
  return result.data;
}

function validateAutomationName(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new ApiError(400, "automationName must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ApiError(400, "automationName cannot be empty.");
  }
  if (trimmed.length > 200) {
    throw new ApiError(400, "automationName must be 200 characters or fewer.");
  }
  return trimmed;
}

function validateAutomationDescription(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new ApiError(400, "automationDescription must be a string.");
  }
  if (value.length > 5000) {
    throw new ApiError(400, "automationDescription must be 5000 characters or fewer.");
  }
  return value;
}

function validateBusinessOwner(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new ApiError(400, "businessOwner must be a string.");
  }
  const trimmed = value.trim();
  if (trimmed.length > 200) {
    throw new ApiError(400, "businessOwner must be 200 characters or fewer.");
  }
  return trimmed || null;
}

function validateTags(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) {
    throw new ApiError(400, "tags must be an array of strings.");
  }
  const tags = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, 12);

  if (tags.length === 0) {
    return [];
  }

  return Array.from(new Set(tags));
}

async function parsePayload(request: Request): Promise<UpdatePayload> {
  try {
    return (await request.json()) as UpdatePayload;
  } catch {
    return {};
  }
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:read", { type: "automation", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const detail = await getAutomationVersionDetail(session.tenantId, params.id);

    if (!detail) {
      throw new ApiError(404, "Automation version not found");
    }

    const workflow = buildWorkflowViewModel(detail.version.workflowJson);

    return NextResponse.json({
      version: {
        id: detail.version.id,
        versionLabel: detail.version.versionLabel,
        status: fromDbAutomationStatus(detail.version.status),
        intakeNotes: detail.version.intakeNotes,
        requirementsText: workflow.requirementsText ?? undefined,
        workflowJson: workflow.workflowSpec,
        blueprintJson: workflow.workflowSpec,
        summary: detail.version.summary,
        businessOwner: detail.version.businessOwner ?? null,
        tags: Array.isArray((detail.version as any).tags) ? (detail.version as any).tags : [],
        createdAt: detail.version.createdAt,
        updatedAt: detail.version.updatedAt,
        tasks: (detail.tasks ?? []).map(presentTask),
      },
      automation: detail.automation
        ? {
            id: detail.automation.id,
            name: detail.automation.name,
            description: detail.automation.description,
          }
        : null,
      project: detail.project
        ? {
            id: detail.project.id,
            status: fromDbAutomationStatus(detail.project.status),
          }
        : null,
      latestQuote: detail.latestQuote
        ? {
            id: detail.latestQuote.id,
            status: fromDbQuoteStatus(detail.latestQuote.status),
            setupFee: detail.latestQuote.setupFee,
            unitPrice: detail.latestQuote.unitPrice,
            estimatedVolume: detail.latestQuote.estimatedVolume,
            clientMessage: detail.latestQuote.clientMessage,
            updatedAt: detail.latestQuote.updatedAt,
          }
        : null,
      latestMetrics: detail.latestMetrics ? presentMetric(detail.latestMetrics) : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:metadata:update", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const payload = await parsePayload(request);
    const { workflowJson: normalizedWorkflowJson } = normalizeWorkflowInput(payload as any);
    const automationName = validateAutomationName((payload as any).automationName ?? (payload as any).name);
    const automationDescription = validateAutomationDescription(
      (payload as any).automationDescription ?? (payload as any).description
    );
    const businessOwner = validateBusinessOwner((payload as any).businessOwner);
    const tags = validateTags((payload as any).tags);
    const intakeNotes = validateIntakeNotes(payload.intakeNotes);
    const requirementsText = validateRequirementsText(payload.requirementsText);
    const workflowJson =
      normalizedWorkflowJson === undefined
        ? undefined
        : validateWorkflow(normalizedWorkflowJson) ?? (normalizedWorkflowJson as any);

    if (
      automationName === undefined &&
      automationDescription === undefined &&
      businessOwner === undefined &&
      tags === undefined &&
      intakeNotes === undefined &&
      requirementsText === undefined &&
      workflowJson === undefined
    ) {
      throw new ApiError(400, "No valid fields provided.");
    }

    const existingDetail = await getAutomationVersionDetail(session.tenantId, params.id);
    if (!existingDetail) {
      throw new ApiError(404, "Automation version not found");
    }
    const existingWorkflow = existingDetail.workflowView ?? buildWorkflowViewModel(existingDetail.version.workflowJson);
    const previousWorkflow = existingWorkflow.workflowSpec;
    
    // #region agent log - Track step counts before save
    const previousStepCount = previousWorkflow?.steps?.length ?? 0;
    const newStepCount = workflowJson?.steps?.length ?? 0;
    if (workflowJson !== undefined) {
      sendDevAgentLog({
        location: "route.ts:237",
        message: "Workflow save - step count check",
        data: {
          versionId: params.id,
          previousStepCount,
          newStepCount,
          stepLoss: previousStepCount > newStepCount ? previousStepCount - newStepCount : 0,
          previousStepIds: previousWorkflow?.steps?.map((step: { id: string }) => step.id) ?? [],
          newStepIds: workflowJson?.steps?.map((step: { id: string }) => step.id) ?? [],
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "save-tracking",
        hypothesisId: "G",
      });
      
      // Safeguard: Warn if significant step loss detected (more than 1 step lost)
      if (previousStepCount > 0 && newStepCount < previousStepCount - 1) {
        const stepsLost = previousStepCount - newStepCount;
        logger.error(`⚠️ Step loss detected: ${previousStepCount} → ${newStepCount} steps (lost ${stepsLost} steps)`);
        sendDevAgentLog({
          location: "route.ts:243",
          message: "⚠️ STEP LOSS DETECTED",
          data: {
            versionId: params.id,
            previousStepCount,
            newStepCount,
            stepsLost,
            previousStepIds:
              previousWorkflow?.steps?.map(
                (step: { id: string; name?: string; stepNumber?: number | string }) => ({
                  id: step.id,
                  name: step.name,
                  stepNumber: typeof step.stepNumber === "number" ? step.stepNumber : Number(step.stepNumber),
                })
              ) ?? [],
            newStepIds:
              workflowJson?.steps?.map((step: { id: string; name?: string; stepNumber?: number | string }) => ({
                id: step.id,
                name: step.name,
                stepNumber: typeof step.stepNumber === "number" ? step.stepNumber : Number(step.stepNumber),
              })) ?? [],
          },
          timestamp: Date.now(),
          sessionId: "debug-session",
          runId: "save-tracking",
          hypothesisId: "G",
        });
        
        // Prevent save if more than 50% of steps are lost (safety threshold)
        const lossPercentage = (stepsLost / previousStepCount) * 100;
        if (lossPercentage > 50 && previousStepCount >= 3) {
          throw new ApiError(400, `Cannot save: ${stepsLost} of ${previousStepCount} steps would be lost (${lossPercentage.toFixed(0)}%). This may indicate a data corruption issue. Please refresh and try again.`);
        }
      }
    }
    // #endregion

    const requirementsTextValue: string | undefined =
      typeof requirementsText === "string" ? requirementsText : undefined;

    const updateParams = {
      tenantId: session.tenantId,
      automationVersionId: params.id,
      automationName,
      automationDescription,
      businessOwner,
      tags,
      intakeNotes,
      requirementsText: requirementsTextValue,
      workflowJson,
      blueprintJson: workflowJson,
    } as unknown as UpdateMetadataParams;

    const updated = await updateAutomationVersionMetadata(updateParams);

    const nextWorkflowView = buildWorkflowViewModel(updated.version.workflowJson);
    const nextWorkflowSpec = nextWorkflowView.workflowSpec;

    const metadata: Record<string, unknown> = {
      updatedFields: {
        intakeNotes: intakeNotes !== undefined,
        requirementsText: requirementsText !== undefined,
        workflowJson: workflowJson !== undefined,
      },
      versionLabel: existingDetail.version.versionLabel,
    };

    if (workflowJson !== undefined) {
      const workflowDiff = diffWorkflow(previousWorkflow, nextWorkflowSpec);
      metadata.workflowSummary = workflowDiff.summary;
      metadata.workflowDiff = workflowDiff;
      metadata.workflowChanges = {
        stepsAdded: workflowDiff.stepsAdded?.length ?? 0,
        stepsRemoved: workflowDiff.stepsRemoved?.length ?? 0,
        stepsRenamed: workflowDiff.stepsRenamed?.length ?? 0,
        branchesAdded: workflowDiff.branchesAdded?.length ?? 0,
        branchesRemoved: workflowDiff.branchesRemoved?.length ?? 0,
      };
      
      // #region agent log - Track step counts after save
      const savedStepCount = nextWorkflowSpec?.steps?.length ?? 0;
      sendDevAgentLog({
        location: "route.ts:265",
        message: "Workflow save - after save verification",
        data: {
          versionId: params.id,
          previousStepCount,
          newStepCount,
          savedStepCount,
          stepsLost: previousStepCount > savedStepCount ? previousStepCount - savedStepCount : 0,
          stepsAdded: workflowDiff.stepsAdded?.length ?? 0,
          stepsRemoved: workflowDiff.stepsRemoved?.length ?? 0,
        },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "save-tracking",
        hypothesisId: "G",
      });
      
      // Safeguard: Verify steps were saved correctly
      if (savedStepCount !== newStepCount) {
        logger.error(`⚠️ Step count mismatch after save: expected ${newStepCount}, got ${savedStepCount}`);
        sendDevAgentLog({
          location: "route.ts:272",
          message: "⚠️ STEP COUNT MISMATCH AFTER SAVE",
          data: { versionId: params.id, expectedStepCount: newStepCount, actualStepCount: savedStepCount },
          timestamp: Date.now(),
          sessionId: "debug-session",
          runId: "save-tracking",
          hypothesisId: "G",
        });
      }
      // #endregion
    }

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.version.update",
      resourceType: "automation_version",
      resourceId: params.id,
      metadata,
    });

    return NextResponse.json({
      version: {
        id: updated.version.id,
        intakeNotes: updated.version.intakeNotes,
        requirementsText:
          typeof nextWorkflowView.requirementsText === "string" ? nextWorkflowView.requirementsText : undefined,
        ...withLegacyWorkflowAlias(nextWorkflowSpec),
        businessOwner: updated.version.businessOwner ?? null,
        tags: Array.isArray((updated.version as any).tags) ? (updated.version as any).tags : [],
        updatedAt: updated.version.updatedAt,
      },
      automation: updated.automation
        ? {
            id: updated.automation.id,
            name: updated.automation.name,
            description: updated.automation.description,
            updatedAt: updated.automation.updatedAt,
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:version:transition", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const detail = await getAutomationVersionDetail(session.tenantId, params.id);
    if (!detail) {
      throw new ApiError(404, "Automation version not found");
    }

    const status = fromDbAutomationStatus(detail.version.status);
    if (status !== "IntakeInProgress") {
      throw new ApiError(400, "Only draft versions can be deleted.");
    }

    const deleted = await deleteAutomationVersion({ tenantId: session.tenantId, automationVersionId: params.id });

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.version.deleted",
      resourceType: "automation_version",
      resourceId: params.id,
      metadata: {
        versionLabel: detail.version.versionLabel,
        automationId: detail.version.automationId,
      },
    });

    return NextResponse.json({ id: deleted.id });
  } catch (error) {
    return handleApiError(error);
  }
}

function presentTask(task: Task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    metadata: task.metadata,
    updatedAt: task.updatedAt,
  };
}

function presentMetric(metric: { [key: string]: any }) {
  return {
    asOfDate: metric.asOfDate,
    totalExecutions: Number(metric.totalExecutions ?? 0),
    successRate: Number(metric.successRate ?? 0),
    successCount: Number(metric.successCount ?? 0),
    failureCount: Number(metric.failureCount ?? 0),
    spendUsd: Number(metric.spendUsd ?? 0),
    hoursSaved: Number(metric.hoursSaved ?? 0),
    estimatedCostSavings: Number(metric.estimatedCostSavings ?? 0),
    hoursSavedDeltaPct: metric.hoursSavedDeltaPct !== null ? Number(metric.hoursSavedDeltaPct) : null,
    estimatedCostSavingsDeltaPct:
      metric.estimatedCostSavingsDeltaPct !== null ? Number(metric.estimatedCostSavingsDeltaPct) : null,
    executionsDeltaPct: metric.executionsDeltaPct !== null ? Number(metric.executionsDeltaPct) : null,
    successRateDeltaPct: metric.successRateDeltaPct !== null ? Number(metric.successRateDeltaPct) : null,
    spendDeltaPct: metric.spendDeltaPct !== null ? Number(metric.spendDeltaPct) : null,
    source: metric.source ?? "unknown",
  };
}

