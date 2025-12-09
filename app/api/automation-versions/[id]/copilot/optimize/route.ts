import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { getAutomationVersionDetail } from "@/lib/services/automations";
import { sanitizeBlueprintTopology } from "@/lib/blueprint/sanitizer";
import { applyStepNumbers } from "@/lib/blueprint/step-numbering";
import { BlueprintSchema, parseBlueprint } from "@/lib/blueprint/schema";
import { getBlueprintCompletionState } from "@/lib/blueprint/completion";
import { automationVersions } from "@/db/schema";
import { db } from "@/db";
import { logAudit } from "@/lib/audit/log";

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

    const currentBlueprint = parseBlueprint(detail.version.workflowJson ?? detail.version.blueprintJson);
    if (!currentBlueprint) {
      throw new ApiError(400, "Workflow is empty.");
    }

    const { blueprint: sanitizedBlueprint, summary } = sanitizeBlueprintTopology(currentBlueprint);
    const numbered = applyStepNumbers(sanitizedBlueprint);

    const validatedBlueprint = BlueprintSchema.parse({
      ...numbered,
      updatedAt: new Date().toISOString(),
    });

    const [savedVersion] = await db
      .update(automationVersions)
      .set({
        workflowJson: validatedBlueprint,
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
      action: "automation.blueprint.optimized",
      resourceType: "automation_version",
      resourceId: params.id,
      metadata: {
        source: "optimize_flow",
      },
    });

    return NextResponse.json({
      blueprint: validatedBlueprint,
      telemetry: {
        sanitizationSummary: summary,
      },
      completion: getBlueprintCompletionState(validatedBlueprint),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

