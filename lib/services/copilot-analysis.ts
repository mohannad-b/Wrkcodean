import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { automationVersions, copilotAnalyses } from "@/db/schema";
import {
  COPILOT_ANALYSIS_VERSION,
  type CopilotAnalysisState,
  cloneCopilotAnalysisState,
} from "@/lib/workflows/copilot-analysis";
import { logger } from "@/lib/logger";

type AccessParams = {
  tenantId: string;
  automationVersionId: string;
};

export async function getCopilotAnalysis(params: AccessParams): Promise<CopilotAnalysisState | null> {
  await ensureAutomationVersionAccess(params.tenantId, params.automationVersionId);

  const [row] = await db
    .select({
      analysis: copilotAnalyses.analysisJson,
      stage: copilotAnalyses.stage,
      questionCount: copilotAnalyses.questionCount,
      askedQuestionsNormalized: copilotAnalyses.askedQuestionsNormalized,
      facts: copilotAnalyses.facts,
      assumptions: copilotAnalyses.assumptions,
      progress: copilotAnalyses.progress,
      lastUserMessageId: copilotAnalyses.lastUserMessageId,
      lastAssistantMessageId: copilotAnalyses.lastAssistantMessageId,
      version: copilotAnalyses.version,
      workflowUpdatedAt: copilotAnalyses.workflowUpdatedAt,
    })
    .from(copilotAnalyses)
    .where(
      and(eq(copilotAnalyses.automationVersionId, params.automationVersionId), eq(copilotAnalyses.tenantId, params.tenantId))
    )
    .limit(1);

  if (!row) return null;

  return {
    ...row.analysis,
    version: row.version ?? row.analysis?.version,
    stage: row.stage ?? row.analysis?.stage,
    question_count: row.questionCount ?? row.analysis?.question_count,
    asked_questions_normalized: row.askedQuestionsNormalized ?? row.analysis?.asked_questions_normalized,
    facts: row.facts ?? row.analysis?.facts,
    assumptions: row.assumptions ?? row.analysis?.assumptions,
    progress: (row.progress as CopilotAnalysisState["progress"]) ?? row.analysis?.progress,
    lastUserMessageId: row.lastUserMessageId ?? row.analysis?.lastUserMessageId,
    lastAssistantMessageId: row.lastAssistantMessageId ?? row.analysis?.lastAssistantMessageId,
    workflowUpdatedAt:
      (row.workflowUpdatedAt as string | null | undefined) ?? row.analysis?.workflowUpdatedAt ?? null,
  } as CopilotAnalysisState;
}

export async function upsertCopilotAnalysis(
  params: AccessParams & { analysis: CopilotAnalysisState; workflowUpdatedAt?: string | Date | null }
): Promise<CopilotAnalysisState> {
  await ensureAutomationVersionAccess(params.tenantId, params.automationVersionId);

  const version = params.analysis.version ?? COPILOT_ANALYSIS_VERSION;
  const payload: CopilotAnalysisState = {
    ...cloneCopilotAnalysisState(params.analysis),
    version,
    lastUpdatedAt: params.analysis.lastUpdatedAt ?? new Date().toISOString(),
  };

  const stage = payload.stage ?? payload.memory?.stage ?? "requirements";
  const questionCount = payload.question_count ?? payload.memory?.question_count ?? 0;
  const askedNormalized =
    payload.asked_questions_normalized ?? payload.memory?.asked_questions_normalized ?? [];
  const facts = payload.facts ?? payload.memory?.facts ?? {};
  const assumptions = payload.assumptions ?? [];
  const progress = payload.progress ? (payload.progress as unknown as Record<string, unknown>) : null;
  let workflowUpdatedAt: Date | null = null;
  if (params.workflowUpdatedAt) {
    const coerced =
      params.workflowUpdatedAt instanceof Date ? params.workflowUpdatedAt : new Date(params.workflowUpdatedAt);
    workflowUpdatedAt = Number.isNaN(coerced.getTime()) ? null : coerced;
  }

  const [upserted] = await db
    .insert(copilotAnalyses)
    .values({
      tenantId: params.tenantId,
      automationVersionId: params.automationVersionId,
      analysisJson: payload,
      version,
      stage,
      questionCount,
      askedQuestionsNormalized: askedNormalized,
      facts,
      assumptions,
      progress,
      lastUserMessageId: payload.lastUserMessageId ?? null,
      lastAssistantMessageId: payload.lastAssistantMessageId ?? null,
      workflowUpdatedAt,
    })
    .onConflictDoUpdate({
      target: [copilotAnalyses.tenantId, copilotAnalyses.automationVersionId],
      set: {
        analysisJson: payload,
        version,
        stage,
        questionCount,
        askedQuestionsNormalized: askedNormalized,
        facts,
        assumptions,
        progress,
        lastUserMessageId: payload.lastUserMessageId ?? null,
        lastAssistantMessageId: payload.lastAssistantMessageId ?? null,
        workflowUpdatedAt,
        updatedAt: new Date(),
      },
    })
    .returning({
      automationVersionId: copilotAnalyses.automationVersionId,
      updatedAt: copilotAnalyses.updatedAt,
    });

  if (process.env.NODE_ENV !== "production") {
    logger.debug("[copilot-analysis] Upserted analysis row", {
      automationVersionId: upserted?.automationVersionId ?? params.automationVersionId,
      updatedAt: upserted?.updatedAt ?? new Date(),
    });
  }

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


