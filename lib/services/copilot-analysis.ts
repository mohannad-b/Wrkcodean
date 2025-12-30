import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { automationVersions, copilotAnalyses } from "@/db/schema";
import {
  COPILOT_ANALYSIS_VERSION,
  type CopilotAnalysisState,
  cloneCopilotAnalysisState,
} from "@/lib/workflows/copilot-analysis";

type AccessParams = {
  tenantId: string;
  automationVersionId: string;
};

export async function getCopilotAnalysis(params: AccessParams): Promise<CopilotAnalysisState | null> {
  await ensureAutomationVersionAccess(params.tenantId, params.automationVersionId);

  const [row] = await db
    .select({
      analysis: copilotAnalyses.analysisJson,
    })
    .from(copilotAnalyses)
    .where(eq(copilotAnalyses.automationVersionId, params.automationVersionId))
    .limit(1);

  return row?.analysis ?? null;
}

export async function upsertCopilotAnalysis(
  params: AccessParams & { analysis: CopilotAnalysisState }
): Promise<CopilotAnalysisState> {
  await ensureAutomationVersionAccess(params.tenantId, params.automationVersionId);

  const version = params.analysis.version ?? COPILOT_ANALYSIS_VERSION;
  const payload: CopilotAnalysisState = {
    ...cloneCopilotAnalysisState(params.analysis),
    version,
    lastUpdatedAt: params.analysis.lastUpdatedAt ?? new Date().toISOString(),
  };

  await db
    .insert(copilotAnalyses)
    .values({
      automationVersionId: params.automationVersionId,
      analysisJson: payload,
      version,
    })
    .onConflictDoUpdate({
      target: copilotAnalyses.automationVersionId,
      set: {
        analysisJson: payload,
        version,
        updatedAt: new Date(),
      },
    });

  return payload;
}

async function ensureAutomationVersionAccess(tenantId: string, automationVersionId: string) {
  const [row] = await db
    .select({
      id: automationVersions.id,
    })
    .from(automationVersions)
    .where(and(eq(automationVersions.id, automationVersionId), eq(automationVersions.tenantId, tenantId)))
    .limit(1);

  if (!row) {
    throw new Error("Automation version not found");
  }
}


