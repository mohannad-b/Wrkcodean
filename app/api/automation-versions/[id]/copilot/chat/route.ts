import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { buildRateLimitKey, ensureRateLimit } from "@/lib/rate-limit";
import { getAutomationVersionDetail } from "@/lib/services/automations";
import { createCopilotMessage, listCopilotMessages } from "@/lib/services/copilot-messages";
import { determineConversationPhase, generateThinkingSteps } from "@/lib/ai/copilot-orchestrator";
import { copilotDebug } from "@/lib/ai/copilot-debug";
import { createCopilotTrace } from "@/lib/ai/copilot-trace";
import { logAudit } from "@/lib/audit/log";
import { createBuildActivityEmitter } from "@/lib/build-activity/normalizer";
import { db } from "@/db";
import {
  automationVersions,
  copilotMessages,
  tasks as tasksTable,
  type CopilotRun,
  type CopilotMessage as CopilotMessageRow,
} from "@/db/schema";
import { createEmptyWorkflowSpec } from "@/lib/workflows/factory";
import type { Workflow } from "@/lib/workflows/types";
import { WorkflowSchema } from "@/lib/workflows/schema";
import { applyStepNumbers } from "@/lib/workflows/step-numbering";
import { parseCommand, isDirectCommand } from "@/lib/workflows/command-parser";
import { executeCommand } from "@/lib/workflows/command-executor";
import { buildWorkflowFromChat, type AITask } from "@/lib/workflows/ai-builder-simple";
import type { SanitizationSummary } from "@/lib/workflows/sanitizer";
import { syncAutomationTasks } from "@/lib/workflows/task-sync";
import { getWorkflowCompletionState } from "@/lib/workflows/completion";
import { evaluateWorkflowProgress } from "@/lib/ai/workflow-progress";
import { diffWorkflow } from "@/lib/workflows/diff";
import { withLegacyWorkflowAlias } from "@/lib/workflows/legacy";
import {
  createEmptyCopilotAnalysisState,
  createEmptyMemory,
  CORE_TODO_DEFINITIONS,
  CORE_TODO_KEYS,
  type CopilotAnalysisState,
  type CopilotTodoItem,
  type CoreTodoKey,
  type CopilotMemory,
  type CopilotMemoryFacts,
  type CopilotChecklistItem,
  type ReadinessEvidence,
  type ReadinessSignals,
  deriveReadinessSignals,
  ensureCoreTodos,
} from "@/lib/workflows/copilot-analysis";
import { getCopilotAnalysis, upsertCopilotAnalysis } from "@/lib/services/copilot-analysis";
import { parseCopilotReply } from "@/lib/ai/parse-copilot-reply";
import { createCopilotRun, getCopilotRunByClientMessageId } from "@/lib/services/copilot-runs";
import { logger } from "@/lib/logger";
import { createSSEStream } from "@/lib/http/sse";
import { generateIntentSummary, type IntentSummary } from "@/lib/ai/intent-summary";
import { ProgressPlanner, type ProgressEvent, validateStatusPayload } from "../progress-planner";
import { evaluateCoreTodos, type CoreTodoJudgeResult } from "@/lib/ai/core-todo-judge";
import { generateCopilotChatReply } from "@/lib/ai/copilot-chat-reply";

const ChatRequestSchema = z.object({
  content: z.string().min(1).max(8000),
  intakeNotes: z.string().max(20000).optional().nullable(),
  snippets: z.array(z.string().max(4000)).optional(),
  clientMessageId: z.string().max(128).optional(),
  runId: z.string().max(128).optional(),
});

type ChatRequest = z.infer<typeof ChatRequestSchema>;

type CopilotMessage = {
  role: "user" | "assistant";
  content: string;
};
type AssistantMessageRow = CopilotMessageRow;

const MAX_MESSAGES = 10;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 16000;
const MIN_AUTOMATION_KEYWORDS = ["automation", "workflow", "process", "step", "system", "trigger", "action"];
const OFF_TOPIC_KEYWORDS = ["weather", "stock", "joke", "recipe", "story", "novel", "poem"];
const FOLLOW_UP_INVITATION = "(Also feel free to add any other requirements you care about.)";
const PROCEED_MESSAGE =
  "BTW, I now have enough info to proceed if you want to submit it to build, or we can keep chatting to get more details to make this more accurate.";
const READINESS_PROCEED_THRESHOLD = 85;

const requestBodyCache = new WeakMap<Request, unknown>();

function summarizeRequirementsChange(previous?: string | null, next?: string | null): string {
  const prev = previous?.trim() ?? "";
  const curr = next?.trim() ?? "";
  if (!prev && !curr) return "No requirements captured yet.";
  if (!prev && curr) return "Requirements captured from the latest update.";
  if (prev && !curr) return "Requirements cleared for a clean rewrite.";
  if (prev === curr) return "Requirements unchanged.";
  const delta = curr.length - prev.length;
  if (Math.abs(delta) < 40) return "Requirements updated with minor edits.";
  return delta > 0 ? "Requirements expanded with new details." : "Requirements tightened for clarity.";
}

function summarizeWorkflowDiff(detail: { summary?: string | null; stepsAdded?: unknown[] } | null, stepCount: number) {
  const summary = detail?.summary?.trim();
  if (summary) {
    return `${summary} (${stepCount} steps).`;
  }
  return `Updated workflow with ${stepCount} steps.`;
}

const SYSTEM_PROMPT =
  "You are Wrk Copilot. You ONLY help users describe and design business processes to automate. If the user asks unrelated questions (general knowledge, advice, or chit chat) you politely redirect them to describing the workflow they want to automate. You return a JSON object that matches the provided Workflow schema exactly.";

const COPILOT_INGEST_ENABLED =
  process.env.COPILOT_INGEST_ENABLED === "1" || process.env.COPILOT_INGEST_ENABLED === "true";
const COPILOT_INGEST_URL = (process.env.COPILOT_INGEST_URL ?? "").trim();

type CopilotRunResult = Awaited<ReturnType<typeof buildIdempotentResponse>> & {
  runId: string;
  message: Awaited<ReturnType<typeof createCopilotMessage>>;
  workflow: Workflow;
  tasks: Awaited<ReturnType<typeof fetchTasksForVersion>>;
  completion: ReturnType<typeof getWorkflowCompletionState>;
  progress: Awaited<ReturnType<typeof evaluateWorkflowProgress>> | null;
  prompt: {
    system: string;
    contextSummary: string;
    messageCount: number;
  } | null;
  commandExecuted: boolean;
  thinkingSteps: ReturnType<typeof generateThinkingSteps>;
  conversationPhase: ReturnType<typeof determineConversationPhase>;
  persistenceError?: boolean;
  proceedReady?: boolean;
  proceedReason?: string | null;
  proceedMessage?: string | null;
  proceedUiStyle?: string | null;
  readinessScore?: number;
  readinessSignals?: ReadinessSignals;
  proceedBasicsMet?: boolean;
  proceedThresholdMet?: boolean;
};

export type CopilotStatusPayload = {
  runId: string;
  requestId: string;
  phase: string;
  message: string;
  seq?: number;
  meta?: Record<string, unknown>;
};

type CopilotErrorPayload = {
  runId: string;
  requestId: string;
  message: string;
  code?: number | string;
};

function sendCopilotIngest(payload: Record<string, unknown>) {
  if (!COPILOT_INGEST_ENABLED) return;
  if (!COPILOT_INGEST_URL) {
    logger.warn("[copilot:ingest] COPILOT_INGEST_ENABLED true but COPILOT_INGEST_URL missing");
    return;
  }
  fetch(COPILOT_INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

type CopilotMessageEventPayload = {
  runId: string;
  requestId: string;
  message: Awaited<ReturnType<typeof createCopilotMessage>>;
  displayText: string;
};

const INTENT_CACHE_TTL_MS = 15 * 60 * 1000;
const intentCache = new Map<
  string,
  {
    summary: IntentSummary;
    cachedAt: number;
  }
>();

type TodoJudgeCacheValue = {
  result: CoreTodoJudgeResult;
  cachedAt: number;
};
const TODO_JUDGE_TTL_MS = 5 * 60 * 1000;
const todoJudgeCache = new Map<string, TodoJudgeCacheValue>();

type CopilotCallbacks = {
  onStatus?: (payload: CopilotStatusPayload) => void;
  onResult?: (payload: CopilotRunResult) => void;
  onError?: (payload: CopilotErrorPayload) => void;
  onMessage?: (payload: CopilotMessageEventPayload) => void;
};

function stripTrailingQuestion(text: string): string {
  if (!text?.trim()) return "";
  return text.replace(/[\s\n]*[^?.!]*\?\s*$/m, "").trim();
}

function ensureSingleQuestion(chatResponse: string, followUp: string | null | undefined): string {
  if (!followUp?.trim()) return chatResponse;
  const preface = stripTrailingQuestion(chatResponse);
  return preface ? `${preface} ${followUp}` : followUp;
}

function isStreamRequest(request: Request) {
  const url = new URL(request.url);
  const streamParam = url.searchParams.get("stream");
  const accept = request.headers.get("accept") ?? "";
  return streamParam === "1" || accept.includes("text/event-stream");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<{ result: T | null; timedOut: boolean }> {
  let timeoutId: NodeJS.Timeout;
  let timedOut = false;

  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      resolve(null);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return { result, timedOut };
  } finally {
    clearTimeout(timeoutId!);
    if (timedOut) {
      // No-op: caller handles fallback behavior
    }
  }
}

const CORE_CHECKLIST_KEYS: CoreTodoKey[] = CORE_TODO_KEYS;

type ChecklistState = Record<string, CopilotChecklistItem>;

function isCoreChecklistKey(key: string | null | undefined): key is CoreTodoKey {
  if (!key) return false;
  return CORE_CHECKLIST_KEYS.includes(key as CoreTodoKey);
}

function ensureChecklist(memory: CopilotMemory): ChecklistState {
  if (!memory.checklist) {
    memory.checklist = {};
  }
  CORE_CHECKLIST_KEYS.forEach((key) => {
    if (!memory.checklist![key]) {
      memory.checklist![key] = {
        key,
        confirmed: false,
        source: undefined,
        value: null,
        evidence: null,
        confidence: 0,
      };
    }
  });
  return memory.checklist!;
}

function normalizeKey(key: string | null | undefined): string | null {
  if (!key) return null;
  return key.trim().toLowerCase();
}

function checklistSnapshot(memory: CopilotMemory) {
  const checklist = ensureChecklist(memory);
  const snapshot: Record<string, { confirmed: boolean; source?: string; value?: string | null }> = {};
  CORE_CHECKLIST_KEYS.forEach((key) => {
    const item = checklist[key];
    snapshot[key] = { confirmed: item?.confirmed ?? false, source: item?.source, value: item?.value ?? null };
  });
  return snapshot;
}

function hasOtherRequirementsLanguage(message: string | null | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return /\banything else\b/.test(lower) || /\bother requirement/.test(lower) || /\bany other requirements/.test(lower);
}

function hasInvitationLine(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return lower.includes("feel free to add any other requirements");
}

function ensureAnalysisTodos(
  state: CopilotAnalysisState,
  context: {
    workflow?: Workflow | null;
    latestUserMessage?: string | null;
    workflowUpdatedAt?: string | null;
    intentSummary?: IntentSummary | null;
  } = {}
): CopilotAnalysisState {
  const todos = ensureCoreTodos(state.todos ?? []);
  const readiness = deriveReadiness({
    analysis: state,
    facts: state.memory?.facts ?? {},
    workflow: context.workflow ?? null,
    latestUserMessage: context.latestUserMessage ?? null,
    intentSummary: context.intentSummary ?? null,
  });
  return {
    ...state,
    todos,
    readiness,
  };
}

function composeInferredSuccessCriteria(evidence: ReadinessEvidence): string {
  const cadence = evidence.cadence ?? null;
  const cadenceText =
    cadence && /\b(every|daily|weekly|monthly|hourly|once|weekly)\b/i.test(cadence) ? cadence : null;
  const timeText = evidence.timeOfDay ? `at ${evidence.timeOfDay}` : null;
  const triggerLead = [cadenceText ?? "On the expected cadence", timeText].filter(Boolean).join(" ").trim();
  const goal = evidence.goalSummary ? truncateText(evidence.goalSummary, 140) : "complete the requested workflow";
  const scope = evidence.scopeHint ? ` for ${evidence.scopeHint}` : "";
  const destination = evidence.destinationDetail ?? "the chosen destination";
  const outputs =
    evidence.outputFields && evidence.outputFields.length
      ? evidence.outputFields.slice(0, 6).join(", ")
      : "the requested fields";
  return `${triggerLead || "When triggered"}, ${goal}${scope} and write ${outputs} to ${destination}.`;
}

function deriveReadiness(params: {
  analysis?: CopilotAnalysisState | null;
  facts?: CopilotMemoryFacts;
  workflow?: Workflow | null;
  latestUserMessage?: string | null;
  intentSummary?: IntentSummary | null;
}): CopilotAnalysisState["readiness"] {
  const facts = params.facts ?? {};
  const workflow = params.workflow ?? null;
  const sections = workflow?.sections ?? [];
  const previousScore = params.analysis?.readiness?.score ?? facts.readiness_floor ?? 0;
  const signalsBase = deriveReadinessSignals({
    facts,
    workflow,
    latestUserMessage: params.latestUserMessage ?? "",
  }).signals;

  const businessObjectives = sections.find((section) => section.key === "business_objectives")?.content?.trim();
  const goalPresent =
    signalsBase.goal ||
    Boolean(params.intentSummary) ||
    Boolean(workflow?.summary) ||
    Boolean(businessObjectives && businessObjectives.length > 6);
  const triggerPresent =
    signalsBase.trigger ||
    Boolean(facts.trigger_cadence || facts.trigger_time) ||
    (workflow?.steps ?? []).some((step) => step.type === "Trigger");
  const outputPresent = signalsBase.output || Boolean(facts.output_fields && facts.output_fields.length > 0);
  const destinationPresent =
    signalsBase.destination ||
    Boolean(facts.storage_destination) ||
    Boolean(facts.systems && facts.systems.length > 0) ||
    sections.some((section) => section.key === "systems" && Boolean(section.content?.trim()));
  const successPresent = Boolean(facts.success_criteria);

  let score = 0;
  if (goalPresent) score = Math.max(score, 10);
  if ((workflow?.steps?.length ?? 0) >= 2) score = Math.max(score, 25);
  if (triggerPresent) score += 15;
  if (outputPresent) score += 15;
  if (destinationPresent) score += 15;
  if (successPresent) score += 15;

  score = Math.min(100, Math.max(previousScore, score));

  const signals: ReadinessSignals = {
    ...signalsBase,
    goal: goalPresent || signalsBase.goal,
    trigger: triggerPresent || signalsBase.trigger,
    destination: destinationPresent || signalsBase.destination,
    output: outputPresent || signalsBase.output,
    scope: signalsBase.scope,
  };

  const stateItemsSatisfied: string[] = [];
  const stateItemsMissing: string[] = [];
  const addState = (flag: boolean, label: string) => (flag ? stateItemsSatisfied.push(label) : stateItemsMissing.push(label));
  addState(signals.goal, "goal");
  addState(signals.trigger, "trigger");
  addState(signals.destination, "destination");
  addState(signals.output, "output");
  addState(signals.scope, "scope");

  const blockingTodos = [];
  if (!signals.trigger) blockingTodos.push("trigger");
  if (!signals.destination) blockingTodos.push("destination");

  return {
    score,
    stateItemsSatisfied,
    stateItemsMissing,
    blockingTodos,
  };
}

function applyDeterministicInference(params: {
  analysis: CopilotAnalysisState;
  workflow: Workflow;
  latestUserMessage: string;
  latestUserMessageId?: string | null;
  intentSummary?: IntentSummary | null;
}): CopilotAnalysisState {
  const { analysis, workflow, latestUserMessage, latestUserMessageId, intentSummary } = params;
  const baseMemory = analysis.memory ?? createEmptyMemory();
  const checklist = ensureChecklist(baseMemory);
  const facts = { ...(baseMemory.facts ?? {}) };
  const workflowUpdatedAt = analysis.workflowUpdatedAt ?? null;
  const { signals, evidence } = deriveReadinessSignals({
    facts,
    workflow,
    latestUserMessage,
    workflowUpdatedAt,
    readinessWorkflowUpdatedAt: facts.readiness_workflow_updated_at ?? null,
  });

  const nowIso = new Date().toISOString();

  if (!facts.output_fields?.length && evidence.outputFields?.length) {
    facts.output_fields = evidence.outputFields.slice(0, 6);
  }
  if (!facts.scope_hint && evidence.scopeHint) {
    facts.scope_hint = evidence.scopeHint;
  }
  if (!facts.goal_summary && evidence.goalSummary) {
    facts.goal_summary = truncateText(evidence.goalSummary, 200);
  }
  if (!facts.storage_destination && evidence.destinationDetail) {
    facts.storage_destination = evidence.destinationDetail;
  }
  if (!facts.trigger_cadence && evidence.cadence) {
    facts.trigger_cadence = evidence.cadence;
  }
  if (!facts.trigger_time && evidence.timeOfDay) {
    facts.trigger_time = evidence.timeOfDay;
  }

  let todos = ensureCoreTodos(analysis.todos ?? []);

  const successInferable = signals.goal && signals.trigger && signals.destination && signals.output && signals.scope;
  const existingSuccess = facts.success_criteria ?? checklist.success_criteria?.value ?? null;
  let successValue = existingSuccess;

  if (successInferable && !successValue) {
    successValue = composeInferredSuccessCriteria(evidence);
  }

  if (successInferable && successValue) {
    facts.success_criteria = successValue;
    facts.success_criteria_evidence =
      facts.success_criteria_evidence ?? {
        messageId: latestUserMessageId ?? null,
        snippet: truncateText(latestUserMessage, 200),
        source: "inferred",
      };
    checklist.success_criteria = {
      ...(checklist.success_criteria ?? { key: "success_criteria", confirmed: false }),
      key: "success_criteria",
      confirmed: true,
      value: successValue,
      evidence: checklist.success_criteria?.evidence ?? truncateText(latestUserMessage, 200),
      confidence: Math.max(checklist.success_criteria?.confidence ?? 0, 0.9),
      source: "ai",
      updatedAt: nowIso,
    };
    todos = todos.map((todo) =>
      (todo.key ?? todo.id) === "success_criteria"
        ? {
            ...todo,
            status: "resolved",
            value: todo.value ?? successValue,
            confidence: Math.max(todo.confidence ?? 0, 0.9),
            resolvedAt: todo.resolvedAt ?? nowIso,
          }
        : todo
    );
  }

  const readiness = deriveReadiness({
    analysis,
    facts,
    workflow,
    latestUserMessage,
    intentSummary: intentSummary ?? null,
  });

  const readinessScore = readiness.score ?? 0;
  const nextFacts = {
    ...facts,
    readiness_floor: Math.max(facts.readiness_floor ?? 0, readinessScore),
    readiness_last_updated_at: nowIso,
    readiness_workflow_updated_at: workflowUpdatedAt ?? null,
    output_fields: facts.output_fields,
    scope_hint: facts.scope_hint,
    goal_summary: facts.goal_summary,
  };

  return {
    ...analysis,
    todos,
    readiness,
    memory: {
      ...baseMemory,
      facts: nextFacts,
      checklist,
    },
  };
}

function applyJudgeTodosToAnalysis(
  analysis: CopilotAnalysisState,
  judgeTodos: CoreTodoJudgeResult["todos"]
): CopilotAnalysisState {
  const ensured = ensureCoreTodos(analysis.todos ?? []);
  const nowIso = new Date().toISOString();
  const updatedTodos = ensured.map((todo) => {
    const judged = judgeTodos.find((item) => normalizeKey(item.key) === normalizeKey(todo.key ?? todo.id));
    if (!judged) return todo;
    const status = judged.status === "resolved" ? "resolved" : "open";
    return {
      ...todo,
      key: judged.key as CoreTodoKey,
      status,
      evidence: judged.evidence ?? todo.evidence ?? null,
      value: judged.value ?? todo.value ?? null,
      confidence:
        typeof judged.confidence === "number"
          ? Math.max(Math.min(judged.confidence, 1), 0)
          : todo.confidence ?? 0,
      resolvedAt: status === "resolved" ? todo.resolvedAt ?? nowIso : null,
      question: todo.question ?? CORE_TODO_DEFINITIONS[judged.key]?.question ?? todo.question,
    } as CopilotTodoItem;
  });

  return {
    ...analysis,
    todos: updatedTodos,
    readiness: deriveReadiness({
      analysis: {
        ...analysis,
        todos: updatedTodos,
      },
      facts: analysis.memory?.facts,
      workflow: null,
      latestUserMessage: analysis.memory?.lastQuestionText ?? null,
    }),
  };
}

function updateChecklistFromJudge(memory: CopilotMemory, judgeTodos: CoreTodoJudgeResult["todos"]): CopilotMemory {
  const checklist = ensureChecklist(memory);
  judgeTodos.forEach((todo) => {
    const key = normalizeKey(todo.key);
    if (!key || !isCoreChecklistKey(key)) return;
    checklist[key] = {
      ...checklist[key],
      key,
      confirmed: todo.status === "resolved",
      evidence: todo.evidence ?? checklist[key]?.evidence ?? null,
      value: todo.value ?? checklist[key]?.value ?? null,
      confidence:
        typeof todo.confidence === "number"
          ? Math.max(Math.min(todo.confidence, 1), 0)
          : checklist[key]?.confidence ?? 0,
      source: "ai",
      updatedAt: new Date().toISOString(),
    };
  });

  return {
    ...memory,
    checklist,
  };
}

function hashIntentValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashTodoState(todos: CopilotAnalysisState["todos"]): string {
  const core = ensureCoreTodos(todos ?? []).map((todo) => ({
    key: todo.key ?? todo.id,
    status: todo.status,
    value: todo.value ?? null,
    confidence: todo.confidence ?? 0,
  }));
  return hashIntentValue(JSON.stringify(core));
}

function hashConversationSummary(summary: string | null | undefined): string {
  return hashIntentValue(summary ?? "none");
}

function buildIntentCacheKey(params: {
  automationVersionId: string;
  userMessage: string;
  workflowUpdatedAt?: string | null;
  workflowSummary?: string | null;
  contextSummary?: string | null;
  hasExistingWorkflow?: boolean;
  intakeNotes?: string | null | undefined;
}): string {
  const parts = [
    params.automationVersionId,
    params.userMessage,
    params.workflowUpdatedAt ?? "workflow-updated-at-missing",
    params.workflowSummary ?? "workflow-summary-missing",
    params.contextSummary ?? "context-summary-missing",
    String(params.hasExistingWorkflow ?? "unknown"),
  ];
  if (params.intakeNotes) {
    parts.push(hashIntentValue(params.intakeNotes));
  }
  return hashIntentValue(parts.join("|"));
}

function getCachedIntent(key: string): IntentSummary | null {
  const cached = intentCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > INTENT_CACHE_TTL_MS) {
    intentCache.delete(key);
    return null;
  }
  return cached.summary;
}

function setCachedIntent(key: string, summary: IntentSummary) {
  intentCache.set(key, { summary, cachedAt: Date.now() });
}

function buildTodoJudgeCacheKey(params: {
  automationVersionId: string;
  userMessage: string;
  workflowUpdatedAt?: string | null;
  todoHash: string;
  conversationHash: string;
  phase?: "pre" | "post";
}): string {
  return hashIntentValue(
    [
      params.automationVersionId,
      params.userMessage,
      params.workflowUpdatedAt ?? "workflow-updated-at-missing",
      params.todoHash,
      params.conversationHash,
      params.phase ?? "post",
    ].join("|")
  );
}

function buildRequirementsStatusHint(judge: CoreTodoJudgeResult | null): { text: string | null; technicalOnlyMissing: boolean } {
  if (!judge) return { text: null, technicalOnlyMissing: false };
  const missing = (judge.missing_categories ?? []).slice(0, 3);
  const bullets: string[] = [];
  if (missing.length > 0) {
    const missingText = missing.map((item) => `${item.category}: ${item.missing_detail}`).join("; ");
    bullets.push(`Missing: ${missingText}`);
  }
  const focus = judge.next_question_focus;
  if (focus?.category && focus.intent) {
    bullets.push(`Next focus: ${focus.category}: ${focus.intent}`);
  }
  const text = bullets.length === 0 ? null : bullets.map((line) => `- ${line}`).join("\n").slice(0, 600);

  const TECHNICAL_CATEGORIES: Set<string> = new Set([
    "systems_access",
    "rules_edge_cases",
    "data_mapping",
    "human_in_loop",
    "volume_performance",
    "ops_monitoring",
  ]);
  const NON_TECHNICAL: Set<string> = new Set(["goal_success", "trigger_inputs", "outputs_destinations"]);

  const hasMissing = missing.length > 0;
  const allMissingTechnical =
    hasMissing && missing.every((item) => TECHNICAL_CATEGORIES.has(item.category) && !NON_TECHNICAL.has(item.category));
  const focusTechnical = focus?.category ? TECHNICAL_CATEGORIES.has(focus.category) : false;
  const technicalOnlyMissing = Boolean(hasMissing && allMissingTechnical && focusTechnical);

  return { text, technicalOnlyMissing };
}

function buildKnownFactsHint({
  analysisState,
  workflow,
  maxLines = 6,
}: {
  analysisState: CopilotAnalysisState;
  workflow: Workflow;
  maxLines?: number;
}): string | null {
  const facts = analysisState.memory?.facts ?? {};
  const lines: string[] = [];

  const push = (label: string, value?: string | string[] | null) => {
    if (!value) return;
    if (Array.isArray(value)) {
      if (!value.length) return;
      lines.push(`${label}: ${value.join(", ")}`);
    } else {
      const trimmed = value.trim();
      if (trimmed) lines.push(`${label}: ${trimmed}`);
    }
  };

  push("Trigger cadence", facts.trigger_cadence as string | undefined);
  push("Trigger time", facts.trigger_time as string | undefined);
  push("Destination", facts.storage_destination as string | undefined);
  push("Success criteria", facts.success_criteria as string | undefined);
  push("Systems", Array.isArray(facts.systems) ? (facts.systems as string[]) : undefined);

  if (workflow.summary) {
    push("Workflow summary", truncateText(workflow.summary, 140));
  }
  const populatedSections =
    workflow.sections
      ?.filter((s) => s.content?.trim())
      .map((s) => `${s.key}: ${truncateText(s.content?.trim() ?? "", 120)}`) ?? [];
  populatedSections.slice(0, 1).forEach((line) => push("Section", line));

  if (!lines.length) return null;
  return lines.slice(0, maxLines).join("\n");
}

function composeFollowUpAndMessage({
  chatResponse,
  followUpQuestion,
  analysisState,
  latestUserMessage,
  followUpMode,
  baseTrace,
}: {
  chatResponse: string | null | undefined;
  followUpQuestion: string | null | undefined;
  analysisState: CopilotAnalysisState;
  latestUserMessage: string;
  followUpMode: string | null;
  baseTrace: ReturnType<typeof createCopilotTrace>;
}) {
  const trimmedFollowUp = followUpQuestion?.trim();
  const baseMemory = analysisState.memory ?? createEmptyMemory();
  const checklistForDecision = ensureChecklist(baseMemory);
  const scrubbedChatResponse = scrubResponseMessage({
    response: chatResponse ?? "",
    lastQuestionText: baseMemory.lastQuestionText ?? null,
    checklist: checklistForDecision,
  });
  if (scrubbedChatResponse !== (chatResponse ?? "")) {
    baseTrace.event("copilot.chat_response_scrubbed_base", {
      before: (chatResponse ?? "").slice(0, 300),
      after: scrubbedChatResponse.slice(0, 300),
    });
  }
  const clarifierFollowUp =
    trimmedFollowUp && normalizeQuestionText(trimmedFollowUp) !== normalizeQuestionText(scrubbedChatResponse)
      ? { question: trimmedFollowUp, key: null }
      : null;

  const nextFollowUpResult =
    clarifierFollowUp
      ? chooseFollowUpQuestion({
          candidate: clarifierFollowUp.question,
          memory: baseMemory,
          latestUserMessage,
        })
      : { question: null, key: null, droppedReason: null };

  let nextFollowUp = nextFollowUpResult.question ?? null;
  let nextFollowUpKey = nextFollowUpResult.key ?? null;
  const candidateDroppedReason = nextFollowUpResult.droppedReason ?? null;

  if (nextFollowUp && scrubbedChatResponse.trim().endsWith("?")) {
    const normalizedExisting = normalizeQuestionText(scrubbedChatResponse);
    const normalizedCandidate = normalizeQuestionText(nextFollowUp);
    if (normalizedExisting === normalizedCandidate) {
      nextFollowUp = null;
      nextFollowUpKey = null;
    }
  }

  let followUpSkippedReason: string | null = null;
  if (clarifierFollowUp && !nextFollowUp) {
    followUpSkippedReason = candidateDroppedReason ?? "clarifier-dropped-or-duplicate";
  } else if (!clarifierFollowUp && !nextFollowUp) {
    followUpSkippedReason = candidateDroppedReason ?? "none-selected";
  } else if (nextFollowUpKey && checklistForDecision[nextFollowUpKey]?.confirmed) {
    followUpSkippedReason = "confirmed-key";
    nextFollowUp = null;
    nextFollowUpKey = null;
  }

  if (nextFollowUpKey === "success_criteria") {
    const askedSuccessBefore =
      (baseMemory.asked_questions_normalized ?? []).some((q) => q.includes("success") || q.includes("kpi")) ?? false;
    const successKnown = Boolean(baseMemory.facts?.success_criteria || checklistForDecision.success_criteria?.value);
    if (checklistForDecision.success_criteria?.confirmed || (askedSuccessBefore && successKnown)) {
      followUpSkippedReason = "success-already-known";
      nextFollowUp = null;
      nextFollowUpKey = null;
    }
  }

  if (
    nextFollowUp &&
    followUpMode !== "technical_opt_in" &&
    !hasInvitationLine(nextFollowUp) &&
    !hasOtherRequirementsLanguage(latestUserMessage)
  ) {
    nextFollowUp = `${nextFollowUp.trim()} ${FOLLOW_UP_INVITATION}`.trim();
  }

  const responseMessage =
    nextFollowUp && nextFollowUp.trim().length > 0
      ? `${scrubbedChatResponse.trim()} ${nextFollowUp.trim()}`.trim()
      : scrubbedChatResponse;

  return {
    responseMessage,
    nextFollowUp,
    nextFollowUpKey,
    followUpSkippedReason,
    candidateDroppedReason,
    scrubbedChatResponse,
  };
}

function getCachedTodoJudge(key: string): CoreTodoJudgeResult | null {
  const cached = todoJudgeCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > TODO_JUDGE_TTL_MS) {
    todoJudgeCache.delete(key);
    return null;
  }
  return cached.result;
}

function setCachedTodoJudge(key: string, result: CoreTodoJudgeResult) {
  todoJudgeCache.set(key, { result, cachedAt: Date.now() });
}

// intent upgrade no longer used (status copy standardized)

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const streaming = isStreamRequest(request);
  const sse = streaming ? createSSEStream({ signal: request.signal }) : null;
  const respondError = async (error: unknown) => {
    if (process.env.NODE_ENV === "test") {
      // Helpful when Vitest swallows stack traces.
      console.error("[copilot-chat] error", error);
    }
    if (streaming && sse) {
      const message = error instanceof Error ? error.message : "Unexpected error.";
      const code = error instanceof ApiError ? error.status : undefined;
      void sse.send("error", { runId: "unknown", requestId: "unknown", message, code });
      void sse.close();
      return sse.response({ status: code ?? 500 });
    }
    if (error instanceof Error && error.message === "Automation version not found") {
      return handleApiError(new ApiError(404, error.message));
    }
    return handleApiError(error);
  };

  try {
    let payload: ChatRequest;
    let rawBody: any;
    try {
      if (requestBodyCache.has(request)) {
        rawBody = requestBodyCache.get(request);
      } else {
        rawBody = await request.json();
        requestBodyCache.set(request, rawBody);
      }
      payload = ChatRequestSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
        throw new ApiError(400, `Invalid request body: ${issues}`);
      }
      throw new ApiError(400, "Invalid request body.");
    }

    const clientMessageId = payload.clientMessageId?.trim();
    const runId = payload.runId?.trim() || clientMessageId || randomUUID();

    if (streaming && sse) {
      const mapDisplayMessage = (raw?: string | null): string | null => {
        if (!raw) return raw ?? null;
        const msg = raw.trim();
        const normalized = msg.replace(/[.…]+$/u, "").trim();
        const direct: Record<string, string> = {
          "Got it — working on it": "I’m starting to build your workflow.",
          "Working on your workflow": "I’m starting to build your workflow.",
          "Reviewing your request": "Reviewing what you asked for",
          "Drafting workflow steps and branches": "Laying out the main steps and branches",
          "Extracting requirements from your last message": "Pulling info from your instructions",
          "Drafting updated workflow from context": "Adding context from our conversation",
          "Preparing draft response": "Finalizing the workflow",
        };
        if (direct[msg]) return direct[msg];
        if (direct[normalized]) return direct[normalized];

        if (
          normalized === "Recomputing required inputs and tasks" ||
          normalized === "Updating list of required inputs and tasks"
        ) {
          return "Figuring out inputs and tasks";
        }

        if (
          normalized === "Updating step graph" ||
          normalized === "Renumbering steps" ||
          normalized === "Updating step graph and renumbering"
        ) {
          return "Organizing the workflow structure";
        }

        if (
          normalized === "Validating everything" ||
          normalized === "Validating blueprint" ||
          normalized === "Validating blueprint schema"
        ) {
          return "Double-checking everything";
        }

        return msg;
      };

      const callbacks: CopilotCallbacks = {
        onStatus: (status: CopilotStatusPayload) => {
          const phase = status.phase ?? "working";
          const mappedMessage = typeof status.message === "string" ? mapDisplayMessage(status.message) : status.message ?? null;
          copilotDebug("copilot_chat.status_emit", {
            runId: status.runId,
            requestId: status.requestId ?? null,
            phase,
            message: mappedMessage,
            seq: status.seq ?? null,
          });
          void sse.send("status", { ...status, phase, message: mappedMessage });
        },
        onResult: (result: CopilotRunResult) => void sse.send("result", result),
        onError: (err: CopilotErrorPayload) => void sse.send("error", err),
        onMessage: (payload: CopilotMessageEventPayload) => void sse.send("message", payload),
      };

      (async () => {
        const runnerStartedAt = Date.now();
        let statusCount = 0;
        copilotDebug("copilot_chat.sse_runner_started", { runId });
        try {
          const session = await requireTenantSession();

          if (!can(session, "automation:metadata:update", { type: "automation_version", tenantId: session.tenantId })) {
            throw new ApiError(403, "Forbidden");
          }

          try {
            ensureRateLimit({
              key: buildRateLimitKey("copilot:chat", session.tenantId),
              limit: Number(process.env.COPILOT_DRAFTS_PER_HOUR ?? 20),
              windowMs: 60 * 60 * 1000,
            });
          } catch {
            throw new ApiError(429, "Too many workflows requested. Please wait before trying again.");
          }

          const detail = await getAutomationVersionDetail(session.tenantId, params.id);
          if (!detail) {
            throw new ApiError(404, "Automation version not found.");
          }

          await runCopilotChat({
            request,
            params,
            payload,
            session,
            detail,
            callbacks:
              callbacks &&
              ({
                onStatus: (status) => {
                  statusCount += 1;
                  return callbacks.onStatus?.(status);
                },
                onResult: callbacks.onResult,
                onError: callbacks.onError,
                onMessage: callbacks.onMessage,
              } as CopilotCallbacks),
            runIdOverride: runId,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unexpected error.";
          const code = error instanceof ApiError ? error.status : undefined;
          try {
            await sse.send("error", { runId, requestId: "runner", message, code });
          } catch {
            // ignore
          }
        } finally {
          copilotDebug("copilot_chat.sse_runner_duration_ms", {
            runId,
            durationMs: Date.now() - runnerStartedAt,
            statusCount,
          });
          copilotDebug("copilot_chat.sse_runner_completed", { runId });
          await sse.close();
        }
      })();

      copilotDebug("copilot_chat.sse_response_returned", { runId });
      return sse.response();
    }

    const session = await requireTenantSession();

    if (!can(session, "automation:metadata:update", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    try {
      ensureRateLimit({
        key: buildRateLimitKey("copilot:chat", session.tenantId),
        limit: Number(process.env.COPILOT_DRAFTS_PER_HOUR ?? 20),
        windowMs: 60 * 60 * 1000,
      });
    } catch {
      throw new ApiError(429, "Too many workflows requested. Please wait before trying again.");
    }

    const detail = await getAutomationVersionDetail(session.tenantId, params.id);
    if (!detail) {
      throw new ApiError(404, "Automation version not found.");
    }

    const callbacks: CopilotCallbacks | undefined =
      streaming && sse
        ? {
            onStatus: (status: CopilotStatusPayload) => void sse.send("status", status),
            onResult: (result: CopilotRunResult) => void sse.send("result", result),
            onError: (err: CopilotErrorPayload) => void sse.send("error", err),
            onMessage: (payload: CopilotMessageEventPayload) => void sse.send("message", payload),
          }
        : undefined;

    const result = await runCopilotChat({
      request,
      params,
      payload,
      session,
      detail,
      callbacks,
      runIdOverride: runId,
    });

    return NextResponse.json(result);
  } catch (error) {
    return respondError(error);
  }
}

type AutomationVersionDetail = NonNullable<Awaited<ReturnType<typeof getAutomationVersionDetail>>>;

async function runCopilotChat({
  request,
  params,
  payload,
  session,
  detail,
  callbacks,
  runIdOverride,
}: {
  request: Request;
  params: { id: string };
  payload: ChatRequest;
  session: Awaited<ReturnType<typeof requireTenantSession>>;
  detail: AutomationVersionDetail;
  callbacks?: CopilotCallbacks;
  runIdOverride?: string;
}): Promise<CopilotRunResult> {
  void request;
  const clientMessageId = payload.clientMessageId?.trim();
  const runId: string = runIdOverride || payload.runId?.trim() || clientMessageId || randomUUID();
  const requestId = randomUUID();
  const baseTrace = createCopilotTrace({
    runId,
    requestId,
    automationVersionId: params.id,
    clientMessageId: clientMessageId ?? undefined,
    source: "copilot/chat",
    phase: "run",
  });
  baseTrace.event("run.started", { automationVersionId: params.id });

  const planner = new ProgressPlanner({
    runId,
    requestId,
    onEmit: (payload: ProgressEvent) => {
      if (!validateStatusPayload(payload)) {
        logger.warn("Invalid status payload skipped", payload);
        return;
      }
      callbacks?.onStatus?.(payload);
    },
  });
  const buildEmitter = createBuildActivityEmitter({ automationVersionId: params.id, runId });
  const emitError = (message: string, code?: number | string) => {
    callbacks?.onError?.({ runId, requestId, message, code });
    buildEmitter.errorStage({
      title: "Build failed",
      detail: message,
      cta: { label: "Retry", destination: "action:retry_build" },
    });
  };
  const previousRequirementsText = detail.version.requirementsText ?? null;
  const earlyAckMessage = "Thinking...";
  let assistantMessage: AssistantMessageRow | null = null;
  let replyFinalized = false;
  const ackTimeoutMs = 1000;
  let ackTimer: NodeJS.Timeout | null = null;
  const composeAssistantReply = (
    chatResponse: string | null | undefined,
    followUp: string | null | undefined
  ): { content: string; followUpAppended: boolean } => {
    const base = (chatResponse ?? "").trim();
    const follow = (followUp ?? "").trim();
    // Drop any question-bearing sentences from the base when a follow-up is present.
    const sentencePattern = /[^.?!]+[.?!]?/g;
    const sentences = base.match(sentencePattern) ?? [];
    const filteredBase =
      follow.length > 0
        ? sentences.filter((s) => !s.includes("?")).join(" ").replace(/\s+/g, " ").trim()
        : base;

    let output = filteredBase;
    let followUpAppended = false;

    if (follow.length > 0 && !output.toLowerCase().includes(follow.toLowerCase())) {
      output = output ? `${output}\n${follow}` : follow;
      followUpAppended = true;
    } else if (!output && follow.length > 0) {
      output = follow;
      followUpAppended = true;
    }

    // Enforce a single question sentence maximum.
    const questionSentences = output.match(/[^.?!]*\?[^.?!]*/g) ?? [];
    if (questionSentences.length > 1) {
      const lastQuestion = questionSentences[questionSentences.length - 1].trim();
      const withoutQuestions = output.replace(/[^.?!]*\?[^.?!]*/g, "").replace(/\s+/g, " ").trim();
      output = withoutQuestions ? `${withoutQuestions}\n${lastQuestion}` : lastQuestion;
    }

    // Ensure the "feel free" line appears at most once.
    const invite = "Also feel free to add any other requirements you care about.";
    const inviteRegex = new RegExp(invite.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const inviteMatches = output.match(inviteRegex) ?? [];
    if (inviteMatches.length > 1) {
      output = output.replace(inviteRegex, "").trim();
      output = output ? `${output}\n${invite}` : invite;
    }

    const content = (output || earlyAckMessage).trim();
    copilotDebug("copilot_chat.composed_reply", {
      runId,
      length: content.length,
      followUpAppended,
    });
    return { content, followUpAppended };
  };
  const persistAssistantMessage = async (
    content: string,
    emit = true,
    finalize = false
  ): Promise<AssistantMessageRow> => {
    if (replyFinalized && assistantMessage && assistantMessage.content !== content) {
      return assistantMessage;
    }
    if (replyFinalized && !assistantMessage) {
      throw new ApiError(500, "Assistant message missing");
    }

    const needsCreation = !assistantMessage;
    const needsUpdate = assistantMessage ? assistantMessage.content !== content : false;

    if (needsCreation) {
      assistantMessage = await createCopilotMessage({
        tenantId: session.tenantId,
        automationVersionId: params.id,
        role: "assistant",
        content,
        createdBy: null,
      });
    } else if (needsUpdate && assistantMessage) {
      const [updated] = await db
        .update(copilotMessages)
        .set({ content })
        .where(
          and(
            eq(copilotMessages.tenantId, session.tenantId),
            eq(copilotMessages.automationVersionId, params.id),
            eq(copilotMessages.id, assistantMessage.id)
          )
        )
        .returning();
      assistantMessage = updated ?? { ...assistantMessage, content };
    }

    if (emit && (needsCreation || needsUpdate) && assistantMessage) {
      callbacks?.onMessage?.({ runId, requestId, message: assistantMessage, displayText: content });
    }

    if (!assistantMessage) {
      throw new ApiError(500, "Failed to persist assistant message");
    }

    if (finalize) {
      replyFinalized = true;
    }

    return assistantMessage;
  };
  const getAssistantMessageOrThrow = (): AssistantMessageRow => {
    if (!assistantMessage) {
      const error = new ApiError(500, "Failed to prepare assistant response.");
      emitError(error.message, error.status);
      throw error;
    }
    return assistantMessage;
  };

  const existingRun =
    clientMessageId &&
    (await getCopilotRunByClientMessageId({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      clientMessageId,
    }));

  if (existingRun && existingRun.automationVersionId === params.id) {
    // #region agent log
    sendCopilotIngest({
      sessionId: "debug-session",
      runId,
      hypothesisId: "H1-idempotent",
      location: "copilot/chat/route.ts:runCopilotChat",
      message: "idempotent replay detected",
      data: { clientMessageId, assistantMessageId: existingRun.assistantMessageId },
      timestamp: Date.now(),
    });
    // #endregion
    const replay = await buildIdempotentResponse({
      run: existingRun,
      tenantId: session.tenantId,
      automationVersionId: params.id,
      detail,
    });
    planner.emit("saving", "Replaying saved result…", { replay: true }, "replay");
    callbacks?.onResult?.({ ...replay, runId } as CopilotRunResult);
    return { ...replay, runId } as CopilotRunResult;
  }

  if (existingRun && existingRun.automationVersionId !== params.id) {
    // #region agent log
    sendCopilotIngest({
      sessionId: "debug-session",
      runId,
      hypothesisId: "H1-idempotent",
      location: "copilot/chat/route.ts:runCopilotChat",
      message: "idempotent run ignored due to version mismatch",
      data: {
        clientMessageId,
        existingAutomationVersionId: existingRun.automationVersionId,
        currentAutomationVersionId: params.id,
      },
      timestamp: Date.now(),
    });
    // #endregion
  }

  const currentWorkflow = detail.workflowView?.workflowSpec ?? createEmptyWorkflowSpec();
  const intakeNotes = payload.intakeNotes ?? detail.version.intakeNotes ?? undefined;

  const trimmedContent = payload.content.trim();
  if (!trimmedContent) {
    throw new ApiError(400, "Message content is required.");
  }

  const userMessage = await createCopilotMessage({
    tenantId: session.tenantId,
    automationVersionId: params.id,
    role: "user",
    content: trimmedContent,
    createdBy: session.userId,
  });

  const messages = await listCopilotMessages({
    tenantId: session.tenantId,
    automationVersionId: params.id,
  });

  const normalizedMessages = normalizeMessages(
    messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.role === "assistant" ? parseCopilotReply(message.content).displayText : message.content,
      }))
  );
  // #region agent log
  sendCopilotIngest({
    sessionId: "debug-session",
    runId,
    hypothesisId: "H2-payload",
    location: "copilot/chat/route.ts:runCopilotChat",
    message: "normalized messages ready",
    data: {
      clientMessageId: clientMessageId ?? null,
      messageCount: normalizedMessages.length,
      latestUserPreview: normalizedMessages.findLast((m) => m.role === "user")?.content.slice(0, 160) ?? null,
    },
    timestamp: Date.now(),
  });
  // #endregion
  const understandingTrace = baseTrace.phase("understanding");
  understandingTrace.event("phase.entered", { messageCount: normalizedMessages.length });

  const latestUserMessage = [...normalizedMessages].reverse().find((message) => message.role === "user");
  if (latestUserMessage && isOffTopic(latestUserMessage.content)) {
    const error = new ApiError(
      400,
      "Wrk Copilot only helps design automations. Tell me about the workflow you want to automate and I can draft a workflow."
    );
    emitError(error.message, error.status);
    throw error;
  }

  let responseMessage = "";
  let responseFollowUp: string | null = null;
  let responseFollowUpKey: string | null = null;
  let scrubbedChatResponse = "";
  let followUpSkippedReason: string | null = null;
  let followUpCandidateDroppedReason: string | null = null;
  let commandExecuted = false;
  let workflowWithTasks: Workflow;
  let aiTasks: AITask[] = [];
  let updatedRequirementsText: string | null | undefined;
  let builderFollowUpQuestion: string | null = null;
  let builderChatResponse: string | null = null;
  let sanitizationSummary: SanitizationSummary | string | null | undefined;

  const fastReplyPromise = generateCopilotChatReply({
    userMessage: latestUserMessage?.content ?? trimmedContent,
    conversationHistory: normalizedMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    knownFactsHint: undefined,
    requirementsStatusHint: undefined,
    followUpMode: null,
  });

  ackTimer = setTimeout(() => {
    if (replyFinalized) return;
    void persistAssistantMessage(earlyAckMessage);
  }, ackTimeoutMs);

      fastReplyPromise
        .then(async (fastReplyResult) => {
          const composedFastReply = composeAssistantReply(
            fastReplyResult?.chatResponse ?? earlyAckMessage,
            fastReplyResult?.followUpQuestion ?? null
          );
          responseMessage = composedFastReply.content;
          responseFollowUp = fastReplyResult?.followUpQuestion?.trim() || null;
          if (!replyFinalized) {
            await persistAssistantMessage(responseMessage, true, true);
          }
        })
    .catch((error) => {
      logger.warn("generateCopilotChatReply (fast path) failed", { error });
    })
    .finally(() => {
      if (ackTimer) {
        clearTimeout(ackTimer);
        ackTimer = null;
      }
    });

  const contextSummary = buildConversationSummary(normalizedMessages, intakeNotes);
  const workflowUpdatedAtIso = detail.version.updatedAt ? new Date(detail.version.updatedAt).toISOString() : null;
  const currentBlueprint = currentWorkflow ?? createEmptyWorkflowSpec();
  const userMessageContent = latestUserMessage?.content ?? trimmedContent;
  const genericIntentSummary = "Reviewing your request";
  let intentSummary: IntentSummary | null = null;
  const hasExistingWorkflow =
    (currentWorkflow.steps?.length ?? 0) > 0 || Boolean(currentWorkflow.summary?.trim()?.length);
  const existingWorkflowSummary = currentWorkflow.summary?.trim() || null;
  const intentContextSummary = [
    hasExistingWorkflow
      ? `Existing workflow: ${existingWorkflowSummary ?? "Not specified yet"}`
      : "Existing workflow: none yet (initial build)",
    `User wants to change/add: ${userMessageContent}`,
  ].join("\n");

  planner.emit("understanding", undefined, { messageCount: normalizedMessages.length }, "intent-initial");

  const intentCacheKey = buildIntentCacheKey({
    automationVersionId: params.id,
    userMessage: userMessageContent,
    workflowUpdatedAt: workflowUpdatedAtIso,
    workflowSummary: existingWorkflowSummary,
    contextSummary: intentContextSummary,
    hasExistingWorkflow,
    intakeNotes: intakeNotes ?? null,
  });

  const cachedIntent = getCachedIntent(intentCacheKey);

  if (cachedIntent) {
    intentSummary = cachedIntent;
    copilotDebug("copilot_chat.intent_summary_emitted", {
      runId,
      userMessage: userMessageContent,
      intentSummary: cachedIntent.intent_summary,
      source: "cache",
    });
    baseTrace.event("intent_summary.emitted", {
      source: "cache",
      summary: cachedIntent.intent_summary,
    });
  }

  if (!intentSummary) {
    let summaryTimedOut = false;
    let summary: IntentSummary | null = null;
    try {
      const intentResult = await withTimeout<IntentSummary | null>(
        generateIntentSummary(userMessageContent, {
          intakeNotes: intakeNotes ?? undefined,
          workflowSummary: existingWorkflowSummary ?? undefined,
          contextSummary: intentContextSummary,
          hasExistingWorkflow,
        }),
        3000
      );
      summary = intentResult.result;
      summaryTimedOut = intentResult.timedOut;
      intentSummary = summary ?? intentSummary;
    } catch (error) {
      logger.warn("generateIntentSummary failed", { error });
    }

    if (summary) {
      setCachedIntent(intentCacheKey, summary);
      copilotDebug("copilot_chat.intent_summary_emitted", {
        runId,
        userMessage: userMessageContent,
        intentSummary: summary.intent_summary,
        source: "llm",
        timedOut: summaryTimedOut,
      });
      baseTrace.event("intent_summary.emitted", {
        source: "llm",
        summary: summary.intent_summary,
        timedOut: summaryTimedOut,
      });
    } else {
      copilotDebug("copilot_chat.intent_summary_failed", {
        runId,
        userMessage: userMessageContent,
        timedOut: summaryTimedOut,
      });
      baseTrace.event("intent_summary.failed", {
        reason: summaryTimedOut ? "timeout" : "null_result",
      });
    }
  }

  const existingAnalysisRaw =
    (await getCopilotAnalysis({ tenantId: session.tenantId, automationVersionId: params.id })) ?? null;
  const mostRecentUserMessageId = [...messages].reverse().find((message) => message.role === "user")?.id ?? null;
  const workflowUpdatedAt = workflowUpdatedAtIso;
  const staleAnalysis =
    (existingAnalysisRaw?.workflowUpdatedAt && workflowUpdatedAt && existingAnalysisRaw.workflowUpdatedAt !== workflowUpdatedAt) ||
    (existingAnalysisRaw?.lastUserMessageId && mostRecentUserMessageId && existingAnalysisRaw.lastUserMessageId !== mostRecentUserMessageId);
  const existingAnalysis = staleAnalysis
    ? createEmptyCopilotAnalysisState()
    : existingAnalysisRaw ?? createEmptyCopilotAnalysisState();
  let analysisState: CopilotAnalysisState = {
    ...existingAnalysis,
    memory: existingAnalysis.memory ?? createEmptyMemory(),
  };
  analysisState = ensureAnalysisTodos(analysisState, {
    workflow: currentWorkflow,
    latestUserMessage: userMessageContent,
    workflowUpdatedAt: workflowUpdatedAtIso,
    intentSummary,
  });
  analysisState = applyDeterministicInference({
    analysis: analysisState,
    workflow: currentWorkflow,
    latestUserMessage: userMessageContent,
    latestUserMessageId: userMessage.id,
    intentSummary,
  });

  // Core todo confirmation is delegated to the judge; deterministic heuristics are no-ops for core items.
  const ensuredMemory = analysisState.memory ?? createEmptyMemory();
  ensureChecklist(ensuredMemory);
  analysisState.memory = ensuredMemory;
  baseTrace.event("copilot.checklist_state", {
    lastQuestionKey: analysisState.memory.lastQuestionKey ?? null,
    checklist: checklistSnapshot(analysisState.memory),
  });

  const directCommand = Boolean(latestUserMessage?.content && isDirectCommand(latestUserMessage.content));
  const todoHash = hashTodoState(analysisState.todos);
  const conversationHash = hashConversationSummary(contextSummary);
  let requirementsStatusHint: string | null = null;
  let preJudgeFailedReason: string | null = null;
  let preJudgeFromCache = false;
  let preJudgeResult: CoreTodoJudgeResult | null = null;
  const knownFactsHint = buildKnownFactsHint({ analysisState, workflow: currentWorkflow });
  const technicalOptIn = Boolean((analysisState.memory?.facts as any)?.technical_opt_in);
  let proceedReady = false;
  let proceedReason: string | null = null;
  let proceedUiStyle: "success" | null = null;
  let proceedMessage: string | null = null;
  let proceedBasicsMet = false;
  let proceedThresholdMet = false;
  let proceedStickyUsed = false;
  let staleRun = false;

  const trace = baseTrace;

  const preJudgeCacheKey = buildTodoJudgeCacheKey({
    automationVersionId: params.id,
    userMessage: userMessageContent,
    workflowUpdatedAt: workflowUpdatedAtIso,
    todoHash,
    conversationHash,
    phase: "pre",
  });
  baseTrace.event("todo_judge.pre.started", { cacheKey: preJudgeCacheKey });
  preJudgeResult = getCachedTodoJudge(preJudgeCacheKey);
  preJudgeFromCache = Boolean(preJudgeResult);
  if (!preJudgeResult) {
    try {
      preJudgeResult = await evaluateCoreTodos({
        automationVersionId: params.id,
        userMessage: userMessageContent,
        conversationSummary: contextSummary,
        workflowSummary: currentWorkflow.summary ?? null,
        stepsSummary: buildStepsSummary(currentWorkflow),
        todos: analysisState.todos ?? [],
        lastQuestionKey: analysisState.memory?.lastQuestionKey ?? null,
        lastQuestionText: analysisState.memory?.lastQuestionText ?? null,
      });
      if (preJudgeResult) {
        setCachedTodoJudge(preJudgeCacheKey, preJudgeResult);
      }
    } catch (error) {
      preJudgeFailedReason = error instanceof Error ? error.message : String(error);
    }
  }
  const requirementsStatus = buildRequirementsStatusHint(preJudgeResult);
  requirementsStatusHint = requirementsStatus.text;
  const followUpMode = requirementsStatus.technicalOnlyMissing && !technicalOptIn ? "technical_opt_in" : null;
  baseTrace.event("todo_judge.pre.completed", {
    cacheKey: preJudgeCacheKey,
    fromCache: preJudgeFromCache,
    hasResult: Boolean(preJudgeResult),
    failed: preJudgeFailedReason ?? null,
    requirementsStatusHint: requirementsStatusHint ?? null,
    technicalOnlyMissing: requirementsStatus.technicalOnlyMissing,
    followUpMode,
  });

  const readinessPreview = deriveReadiness({
    analysis: analysisState,
    facts: analysisState.memory?.facts ?? {},
    workflow: currentWorkflow,
    latestUserMessage: userMessageContent,
    intentSummary,
  });
  const readinessPreviewScore = Math.max(
    readinessPreview.score ?? 0,
    (analysisState.memory?.facts as any)?.readiness_floor ?? 0
  );
  const readinessPreviewStatus =
    readinessPreviewScore >= READINESS_PROCEED_THRESHOLD ? "done" : ("waiting_user" as const);

  buildEmitter.startStage({
    stage: "readiness",
    title: "Assessing readiness",
    detail: "Reviewing current requirements and workflow context.",
    progress: Math.min(100, Math.max(5, readinessPreviewScore || 5)),
  });
  if (readinessPreviewStatus === "done") {
    buildEmitter.doneStage({
      stage: "readiness",
      title: "Readiness checked",
      detail: "Ready to proceed.",
      progress: readinessPreviewScore,
    });
  } else {
    buildEmitter.updateStage({
      stage: "readiness",
      status: "waiting_user",
      title: "Readiness needs input",
      detail: "More details needed before building.",
      progress: readinessPreviewScore,
      cta: { label: "Review requirements", destination: "tab:requirements" },
    });
  }

  if (directCommand && latestUserMessage) {
    commandExecuted = true;
    const command = parseCommand(latestUserMessage.content);
    planner.emit("drafting", "Applying direct command…", { command: command.type }, "direct-command");
    const commandResult = executeCommand(currentWorkflow, command);
    if (!commandResult.success) {
      const error = new ApiError(400, commandResult.error ?? "Command failed");
      emitError(error.message, error.status);
      throw error;
    }
    workflowWithTasks = commandResult.workflow;
    responseMessage = commandResult.message ? `Done. ${commandResult.message}` : "Done.";

    if (commandResult.auditEvents.length) {
      await Promise.all(
        commandResult.auditEvents.map((event) =>
          logAudit({
            tenantId: session.tenantId,
            userId: session.userId,
            action: event.action,
            resourceType: "automation_version",
            resourceId: params.id,
            metadata: event.metadata,
          })
        )
      );
    }

    copilotDebug("copilot_chat.command_executed", {
      automationVersionId: params.id,
      command: command.type,
      message: responseMessage,
    });
  } else {
    try {
      const draftingTextBase =
        (intentSummary?.intent_summary && intentSummary.intent_summary.length > 0
          ? intentSummary.intent_summary
          : genericIntentSummary) ?? "Updating your workflow…";
      planner.setIntentSummary(draftingTextBase);
      buildEmitter.startStage({
        stage: "requirements",
        title: "Capturing requirements",
        detail: "Extracting requirements from the conversation.",
        progress: 15,
      });
      planner.emit("drafting", undefined, { intakeNotes: Boolean(intakeNotes), messages: normalizedMessages.length }, "drafting");
      const draftingTrace = trace.phase("drafting");
      draftingTrace.event("phase.entered", { messageCount: normalizedMessages.length });

      // #region agent log
      sendCopilotIngest({
        sessionId: "debug-session",
        runId,
        hypothesisId: "H3-llm",
        location: "copilot/chat/route.ts:runCopilotChat",
        message: "llm build starting",
        data: {
          userMessagePreview: userMessageContent.slice(0, 200),
          historyCount: normalizedMessages.length,
          hasIntakeNotes: Boolean(intakeNotes),
        },
        timestamp: Date.now(),
      });
      // #endregion

      const buildSpan = draftingTrace.spanStart("llm.buildWorkflowFromChat", {
        messageCount: normalizedMessages.length,
        hasIntakeNotes: Boolean(intakeNotes),
      });

      const heavyBuildPromise = buildWorkflowFromChat({
        userMessage: userMessageContent,
        currentWorkflow,
        currentBlueprint,
        conversationHistory: normalizedMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        requirementsText: detail.version.requirementsText ?? undefined,
        requirementsStatusHint,
        followUpMode,
        knownFactsHint,
        memorySummary: analysisState.memory?.summary_compact ?? null,
        memoryFacts: analysisState.memory?.facts ?? {},
        onStatus: ({ phase, text }) => planner.emit(phase as any, text, undefined, `builder-${phase}`),
        trace: baseTrace,
      });

      const chatReplyPromise = generateCopilotChatReply({
        userMessage: userMessageContent,
        conversationHistory: normalizedMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        knownFactsHint,
        requirementsStatusHint,
        followUpMode,
      });

      let chatReply: Awaited<ReturnType<typeof generateCopilotChatReply>> | null = null;
      try {
        chatReply = await chatReplyPromise;
      } catch (error) {
        logger.warn("generateCopilotChatReply failed", { error });
      }
      if (chatReply) {
        const composed = composeFollowUpAndMessage({
          chatResponse: chatReply.chatResponse,
          followUpQuestion: chatReply.followUpQuestion,
          analysisState,
          latestUserMessage: userMessageContent,
          followUpMode,
          baseTrace,
        });
        responseMessage = composed.responseMessage;
        responseFollowUp = composed.nextFollowUp;
        responseFollowUpKey = composed.nextFollowUpKey;
        followUpSkippedReason = composed.followUpSkippedReason;
        followUpCandidateDroppedReason = composed.candidateDroppedReason;
        scrubbedChatResponse = composed.scrubbedChatResponse;
        if (responseMessage && responseFollowUp) {
          responseMessage = ensureSingleQuestion(responseMessage, responseFollowUp);
        }
      }

      const {
        workflow: aiGeneratedWorkflow,
        tasks: generatedTasks,
        chatResponse,
        followUpQuestion,
        sanitizationSummary: builderSanitizationSummary,
        requirementsText: newRequirementsText,
      } = await heavyBuildPromise;

      const latestUserMessageQuery = db
        .select({ id: copilotMessages.id })
        .from(copilotMessages)
        .where(
          and(
            eq(copilotMessages.tenantId, session.tenantId),
            eq(copilotMessages.automationVersionId, params.id),
            eq(copilotMessages.role, "user")
          )
        );
      const latestUserMessageOrdered =
        typeof (latestUserMessageQuery as { orderBy?: (value: unknown) => unknown }).orderBy === "function"
          ? (latestUserMessageQuery as { orderBy: (value: unknown) => unknown }).orderBy(desc(copilotMessages.createdAt))
          : latestUserMessageQuery;
      const latestUserMessageLimited =
        typeof (latestUserMessageOrdered as { limit?: (value: number) => unknown }).limit === "function"
          ? (latestUserMessageOrdered as { limit: (value: number) => unknown }).limit(1)
          : latestUserMessageOrdered;
      const latestUserMessageRow = (await latestUserMessageLimited) as Array<{ id: string }>;
      const latestUserMessageId = latestUserMessageRow[0]?.id ?? null;
      staleRun =
        Boolean(latestUserMessageId && latestUserMessageId !== userMessage.id) ||
        Boolean(existingAnalysisRaw?.lastUserMessageId && existingAnalysisRaw.lastUserMessageId !== userMessage.id);

      if (staleRun) {
        draftingTrace.event("workflow.stale_skipped", {
          latestUserMessageId,
          currentUserMessageId: userMessage.id,
        });
        copilotDebug("copilot_chat.stale_run_detected", {
          automationVersionId: params.id,
          runId,
          latestUserMessageId,
          currentUserMessageId: userMessage.id,
        });
      }

      builderFollowUpQuestion = followUpQuestion ?? null;
      builderChatResponse = chatResponse ?? null;
      sanitizationSummary = builderSanitizationSummary;
      updatedRequirementsText = newRequirementsText;

      buildEmitter.doneStage({
        stage: "requirements",
        title: "Requirements updated",
        detail: summarizeRequirementsChange(previousRequirementsText, updatedRequirementsText ?? null),
        progress: 35,
      });

      draftingTrace.spanEnd(buildSpan, {
        tasksReturned: generatedTasks.length,
        stepsReturned: aiGeneratedWorkflow.steps?.length ?? 0,
      });

      // #region agent log
      sendCopilotIngest({
        sessionId: "debug-session",
        runId,
        hypothesisId: "H3-llm",
        location: "copilot/chat/route.ts:runCopilotChat",
        message: "llm build completed",
        data: {
          chatResponsePreview: (chatResponse ?? "").slice(0, 160),
          followUpPreview: followUpQuestion?.slice(0, 160) ?? null,
          stepCount: aiGeneratedWorkflow.steps?.length ?? 0,
          taskCount: generatedTasks.length,
        },
        timestamp: Date.now(),
      });
      // #endregion

      copilotDebug("copilot_chat.post_build_metrics", {
        automationVersionId: params.id,
        userMessagePreview: userMessageContent.slice(0, 200),
        aiGeneratedStepCount: aiGeneratedWorkflow.steps?.length ?? 0,
        sanitizationSummary,
        tasksReturned: generatedTasks.length,
      });

      const numberedWorkflow = applyStepNumbers(aiGeneratedWorkflow);
      draftingTrace.event("workflow.stepNumbering.completed", { stepCount: numberedWorkflow.steps.length });
      planner.emit("structuring", undefined, { stepCount: numberedWorkflow.steps.length }, "structuring");
      aiTasks = generatedTasks;

      let taskAssignments: Record<string, string[]> = {};

      buildEmitter.startStage({
        stage: "tasks",
        title: "Computing tasks",
        detail: `Preparing ${aiTasks.length} task${aiTasks.length === 1 ? "" : "s"} from requirements.`,
        progress: 45,
      });

      if (!staleRun) {
        const taskSyncSpan = draftingTrace.spanStart("task.sync", { taskCount: aiTasks.length });
        taskAssignments = await syncAutomationTasks({
          tenantId: session.tenantId,
          automationVersionId: params.id,
          aiTasks,
          blueprint: numberedWorkflow,
          workflow: numberedWorkflow,
        });
        const tasksAssignedCount = Object.values(taskAssignments).reduce(
          (total, ids) => total + (ids?.length ?? 0),
          0
        );
        draftingTrace.spanEnd(taskSyncSpan, { tasksAssignedCount });
        buildEmitter.doneStage({
          stage: "tasks",
          title: "Tasks updated",
          detail: `Created/updated ${aiTasks.length} tasks with ${tasksAssignedCount} step assignments.`,
          progress: 55,
        });
      } else {
        draftingTrace.event("task.sync.skipped_stale_run", {
          taskCount: aiTasks.length,
          latestUserMessageId,
        });
        buildEmitter.updateStage({
          stage: "tasks",
          status: "blocked",
          title: "Tasks sync skipped",
          detail: "A newer request superseded this run.",
          progress: 55,
          cta: { label: "Review tasks", destination: "tab:tasks" },
        });
      }

      workflowWithTasks = {
        ...numberedWorkflow,
        steps: numberedWorkflow.steps.map((step) => ({
          ...step,
          taskIds: Array.from(new Set(taskAssignments[step.id] ?? step.taskIds ?? [])),
        })),
      };
      buildEmitter.startStage({
        stage: "workflow_build",
        title: "Building workflow",
        detail: `Structuring ${workflowWithTasks.steps?.length ?? 0} steps and branches.`,
        progress: 65,
      });
      const judgeCacheKey = buildTodoJudgeCacheKey({
        automationVersionId: params.id,
        userMessage: userMessageContent,
        workflowUpdatedAt: workflowUpdatedAtIso,
        todoHash,
        conversationHash,
        phase: "post",
      });
      baseTrace.event("todo_judge.started", { cacheKey: judgeCacheKey });
      let judgeResult = getCachedTodoJudge(judgeCacheKey);
      let judgeFromCache = Boolean(judgeResult);
      let judgeFailedReason: string | null = null;

      if (!judgeResult) {
        try {
          judgeResult = await evaluateCoreTodos({
            automationVersionId: params.id,
            userMessage: userMessageContent,
            conversationSummary: contextSummary,
            workflowSummary: workflowWithTasks.summary ?? currentWorkflow.summary ?? null,
            stepsSummary: buildStepsSummary(workflowWithTasks),
            todos: analysisState.todos ?? [],
            lastQuestionKey: analysisState.memory?.lastQuestionKey ?? null,
            lastQuestionText: analysisState.memory?.lastQuestionText ?? null,
          });
          if (judgeResult) {
            setCachedTodoJudge(judgeCacheKey, judgeResult);
            judgeFromCache = false;
          }
        } catch (error) {
          judgeFailedReason = error instanceof Error ? error.message : String(error);
        }
      }

      if (!judgeResult) {
        judgeFailedReason = judgeFailedReason ?? "null_or_parse_failure";
        baseTrace.event("todo_judge.failed", {
          cacheKey: judgeCacheKey,
          reason: judgeFailedReason,
        });
      }

      if (judgeResult) {
        const before = ensureCoreTodos(analysisState.todos ?? []);
        analysisState = applyJudgeTodosToAnalysis(analysisState, judgeResult.todos);
        analysisState.memory = updateChecklistFromJudge(analysisState.memory ?? createEmptyMemory(), judgeResult.todos);
        const after = ensureCoreTodos(analysisState.todos ?? []);
        const changedKeys = after
          .filter((todo) => {
            const prev = before.find((t) => (t.key ?? t.id) === (todo.key ?? todo.id));
            return prev && prev.status !== todo.status;
          })
          .map((todo) => todo.key ?? todo.id);

        baseTrace.event("todo_judge.completed", {
          cacheKey: judgeCacheKey,
          fromCache: judgeFromCache,
          changedKeys,
          followupSuggested: false,
          followupKey: null,
        });
      }

      if (!responseMessage) {
        const composed = composeFollowUpAndMessage({
          chatResponse: builderChatResponse ?? chatResponse,
          followUpQuestion: builderFollowUpQuestion ?? followUpQuestion,
          analysisState,
          latestUserMessage: userMessageContent,
          followUpMode,
          baseTrace,
        });
        const composedReply = composeAssistantReply(composed.responseMessage, composed.nextFollowUp);
        responseMessage = composedReply.content;
        responseFollowUp = composed.nextFollowUp;
        responseFollowUpKey = composed.nextFollowUpKey;
        followUpSkippedReason = composed.followUpSkippedReason;
        followUpCandidateDroppedReason = composed.candidateDroppedReason;
        scrubbedChatResponse = composed.scrubbedChatResponse;
      }

      if (!replyFinalized && responseMessage) {
        await persistAssistantMessage(responseMessage, true, true);
      }

      const baseMemory = analysisState.memory ?? createEmptyMemory();
      ensureChecklist(baseMemory);
      analysisState = {
        ...analysisState,
        memory: refreshMemoryState({
          previous: baseMemory,
          workflow: workflowWithTasks,
          lastUserMessage: userMessageContent,
          appliedFollowUp: responseFollowUp ?? builderFollowUpQuestion ?? null,
          followUpKey: responseFollowUp ? responseFollowUpKey : null,
        }),
      };
      analysisState = applyDeterministicInference({
        analysis: analysisState,
        workflow: workflowWithTasks,
        latestUserMessage: userMessageContent,
        latestUserMessageId: userMessage.id,
      });

      if (responseFollowUp && responseFollowUp.trim().length > 0 && analysisState.memory?.lastQuestionKey) {
        baseTrace.event("copilot.follow_up_asked", {
          question: responseFollowUp,
          key: analysisState.memory?.lastQuestionKey,
        });
      }

      baseTrace.event("copilot.follow_up_decision", {
        judgeFollowUp: null,
        judgeFollowUpKey: null,
        clarifierFollowUp: builderFollowUpQuestion ?? null,
        chosenFollowUp: responseFollowUp ?? null,
        chosenFollowUpKey: responseFollowUpKey ?? null,
        whySkipped: followUpSkippedReason,
        lastQuestionKey: analysisState.memory?.lastQuestionKey ?? null,
        judgeFailed: judgeFailedReason,
        selectionSource: builderFollowUpQuestion ? "draft_clarifier" : null,
        followUpMode,
        dropReason: followUpCandidateDroppedReason ?? null,
      });

      baseTrace.event("copilot.response_composed", {
        chatResponse: scrubbedChatResponse.slice(0, 300),
        followUp: responseFollowUp ?? null,
        followUpKey: responseFollowUpKey ?? null,
      });

      baseTrace.event("copilot_chat.llm_response", {
        automationVersionId: params.id,
        chatResponse: builderChatResponse ?? chatResponse ?? null,
        followUpQuestion: builderFollowUpQuestion ?? followUpQuestion ?? null,
        stepCount: workflowWithTasks.steps.length,
        taskCount: aiTasks.length,
        sanitizationSummary,
      });
    } catch (error) {
      emitError(error instanceof Error ? error.message : "Failed to draft workflow");
      throw error;
    }
  }

  // Compute proceed-readiness and persist sticky facts to avoid UI flicker.
  const factsSnapshot = analysisState.memory?.facts ?? {};
  const checklistSnapshotState = analysisState.memory?.checklist ?? {};
  const sectionsSnapshot = workflowWithTasks.sections ?? [];
  const readinessResolved =
    analysisState.readiness ??
    deriveReadiness({
      analysis: analysisState,
      facts: factsSnapshot,
      workflow: workflowWithTasks,
      latestUserMessage: latestUserMessage?.content ?? userMessageContent,
      intentSummary,
    });
  analysisState = { ...analysisState, readiness: readinessResolved };
  const readinessScore = Math.max(readinessResolved.score ?? 0, factsSnapshot.readiness_floor ?? 0);
  const readinessSignals = deriveReadinessSignals({
    facts: factsSnapshot,
    workflow: workflowWithTasks,
    workflowUpdatedAt: workflowUpdatedAtIso,
    readinessWorkflowUpdatedAt: factsSnapshot.readiness_workflow_updated_at ?? null,
  });
  const triggerPresent =
    readinessSignals.signals.trigger ||
    sectionsSnapshot.some(
      (section) =>
        section.key === "business_requirements" &&
        /(\b\d+(?:am|pm)\b|daily|weekly|monthly|every)/i.test(section.content ?? "")
    );
  const destinationPresent =
    readinessSignals.signals.destination ||
    Boolean(checklistSnapshotState.systems?.confirmed || checklistSnapshotState.systems?.value) ||
    sectionsSnapshot.some((section) => section.key === "systems" && Boolean(section.content?.trim()));

  proceedBasicsMet = triggerPresent && destinationPresent;
  proceedThresholdMet = readinessScore >= READINESS_PROCEED_THRESHOLD;

  const previousStickyReady = Boolean((factsSnapshot as any).proceed_ready);
  const previousStickyVersion = (factsSnapshot as any).proceed_ready_workflow_updated_at ?? null;
  const stickyValid = previousStickyReady && (!workflowUpdatedAtIso || previousStickyVersion === workflowUpdatedAtIso);

  if (proceedBasicsMet && (proceedThresholdMet || stickyValid)) {
    proceedReady = true;
    proceedStickyUsed = !proceedThresholdMet && stickyValid;
    if (proceedThresholdMet) {
      proceedReason = `readiness>=${READINESS_PROCEED_THRESHOLD}`;
    } else if (stickyValid) {
      proceedReason = (factsSnapshot as any).proceed_reason ?? "sticky";
    }
  } else {
    proceedReady = false;
    proceedReason = null;
    proceedStickyUsed = false;
  }

  const nextFacts = { ...(factsSnapshot as any) } as CopilotMemoryFacts & Record<string, unknown>;
  if (proceedReady) {
    nextFacts.proceed_ready = true;
    nextFacts.proceed_reason = proceedReason;
    nextFacts.proceed_ready_workflow_updated_at = workflowUpdatedAtIso;
  } else {
    delete (nextFacts as any).proceed_ready;
    delete (nextFacts as any).proceed_reason;
    delete (nextFacts as any).proceed_ready_workflow_updated_at;
  }

  if (analysisState.memory) {
    analysisState = {
      ...analysisState,
      memory: {
        ...analysisState.memory,
        facts: nextFacts,
      },
    };
  }

  if (proceedReady) {
    proceedUiStyle = "success";
    proceedMessage = PROCEED_MESSAGE;
  }

  logger.debug("copilot.readiness.final", {
    score: readinessScore,
    signals: readinessSignals.signals,
  });

  baseTrace.event("copilot.proceed_ready", {
    proceedReady,
    proceedReason,
    readinessScore,
    basicsMet: proceedBasicsMet,
    thresholdMet: proceedThresholdMet,
    stickyFlagUsed: proceedStickyUsed,
    readinessThreshold: READINESS_PROCEED_THRESHOLD,
  });

  const validatedWorkflow = directCommand
    ? ({
        ...workflowWithTasks,
        status: workflowWithTasks.status ?? "Draft",
        updatedAt: new Date().toISOString(),
      } as Workflow)
    : WorkflowSchema.parse({
        ...workflowWithTasks,
        status: "Draft",
        updatedAt: new Date().toISOString(),
      });

  copilotDebug("copilot_chat.workflow_ready", {
    automationVersionId: params.id,
    stepCount: validatedWorkflow.steps?.length ?? 0,
    sectionCount: validatedWorkflow.sections?.length ?? 0,
  });
  const savingTextBase = "Saving workflow changes";
  planner.emit("saving", savingTextBase, { stepCount: validatedWorkflow.steps?.length ?? 0 }, "saving");
  const savingTrace = trace.phase("saving");
  const saveSpan = savingTrace.spanStart("workflow.save", { stepCount: validatedWorkflow.steps?.length ?? 0 });

  const updatePayload: any = {
    workflowJson: validatedWorkflow,
    updatedAt: new Date(),
  };

  let savedVersion = detail.version;

  if (commandExecuted === false && typeof updatedRequirementsText === "string") {
    const trimmed = updatedRequirementsText.trim();
    if (trimmed.length > 0) {
      updatePayload.requirementsText = trimmed;
    }
  }

  if (!staleRun) {
    const [persistedVersion] = await db
      .update(automationVersions)
      .set(updatePayload)
      .where(eq(automationVersions.id, params.id))
      .returning();

    savingTrace.spanEnd(saveSpan, { stepCount: validatedWorkflow.steps?.length ?? 0 });

    if (!persistedVersion) {
      const error = new ApiError(500, "Failed to save workflow.");
      emitError(error.message, error.status);
      throw error;
    }

    savedVersion = persistedVersion;
    revalidatePath(`/automations/${detail.automation?.id ?? persistedVersion.automationId}`);
  } else {
    savingTrace.spanEnd(saveSpan, { stepCount: validatedWorkflow.steps?.length ?? 0, staleRun: true, skipped: true });
  }

  const finalAssistantMessage = getAssistantMessageOrThrow();

  savingTrace.event("assistantMessage.saved", { messageId: finalAssistantMessage.id });

  if (clientMessageId && !staleRun) {
    let runResult = null;
    try {
      runResult = await createCopilotRun({
        tenantId: session.tenantId,
        automationVersionId: params.id,
        clientMessageId,
        userMessageId: userMessage.id,
        assistantMessageId: finalAssistantMessage.id,
      });
    } catch (runError) {
      const isDuplicate =
        (runError as any)?.cause?.code === "23505" ||
        (runError instanceof Error && /duplicate key/i.test(runError.message));
      if (isDuplicate) {
        const existingRun = await getCopilotRunByClientMessageId({
          tenantId: session.tenantId,
          automationVersionId: params.id,
          clientMessageId,
        });
        if (existingRun) {
          const replay = await buildIdempotentResponse({
            run: existingRun,
            tenantId: session.tenantId,
            automationVersionId: params.id,
            detail,
          });
          callbacks?.onResult?.({ ...replay, runId } as CopilotRunResult);
          return { ...replay, runId } as CopilotRunResult;
        }
      }
      throw runError;
    }

    if (runResult && runResult.assistantMessageId !== finalAssistantMessage.id) {
      const replay = await buildIdempotentResponse({
        run: runResult,
        tenantId: session.tenantId,
        automationVersionId: params.id,
        detail,
      });
      callbacks?.onResult?.({ ...replay, runId } as CopilotRunResult);
      return { ...replay, runId } as CopilotRunResult;
    }
  }

  copilotDebug("copilot_chat.persisted_message", {
    automationVersionId: params.id,
    messageId: finalAssistantMessage.id,
    commandExecuted,
  });

  const augmentedMessages = [...normalizedMessages, { role: "assistant" as const, content: responseMessage }];
  const conversationPhase = determineConversationPhase(validatedWorkflow, augmentedMessages);
  const thinkingSteps = generateThinkingSteps(conversationPhase, latestUserMessage?.content, validatedWorkflow);

  if (!commandExecuted) {
    const diff = diffWorkflow(currentWorkflow, validatedWorkflow);
    buildEmitter.doneStage({
      stage: "workflow_build",
      title: "Workflow built",
      detail: summarizeWorkflowDiff(diff, validatedWorkflow.steps?.length ?? 0),
      progress: 85,
    });
    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.workflow.drafted",
      resourceType: "automation_version",
      resourceId: params.id,
      metadata: {
        source: "copilot",
        versionLabel: detail.version.versionLabel,
        summary: diff.summary,
        diff,
        changes: {
          stepsAdded: diff.stepsAdded?.length ?? 0,
          stepsRemoved: diff.stepsRemoved?.length ?? 0,
          stepsRenamed: diff.stepsRenamed?.length ?? 0,
          branchesAdded: diff.branchesAdded?.length ?? 0,
          branchesRemoved: diff.branchesRemoved?.length ?? 0,
        },
      },
    });
    savingTrace.event("audit.logged", { automationVersionId: params.id });
  } else {
    buildEmitter.doneStage({
      stage: "workflow_build",
      title: "Workflow updated",
      detail: `Updated workflow with ${validatedWorkflow.steps?.length ?? 0} steps.`,
      progress: 85,
    });
  }

  buildEmitter.startStage({
    stage: "validation",
    title: "Validating workflow",
    detail: "Checking workflow integrity and required fields.",
    progress: 88,
  });
  buildEmitter.doneStage({
    stage: "validation",
    title: "Validation complete",
    detail: "Workflow passed validation checks.",
    progress: 90,
  });

  const completionState = getWorkflowCompletionState(validatedWorkflow);
  let progressSnapshot = null;
  try {
    progressSnapshot = await evaluateWorkflowProgress({
      workflow: validatedWorkflow,
      completionState,
      latestUserMessage: latestUserMessage?.content ?? null,
    });
  } catch (error) {
    copilotDebug("copilot_chat.progress_eval_failed", error instanceof Error ? error.message : error);
  }

  if (progressSnapshot) {
    analysisState = {
      ...analysisState,
      progress: progressSnapshot,
    };
  }

  analysisState = {
    ...analysisState,
    stage: analysisState.memory?.stage ?? "requirements",
    question_count: analysisState.memory?.question_count ?? 0,
    asked_questions_normalized: analysisState.memory?.asked_questions_normalized ?? [],
    facts: analysisState.memory?.facts ?? {},
    assumptions: analysisState.assumptions ?? [],
    lastUserMessageId: userMessage.id,
    lastAssistantMessageId: finalAssistantMessage.id,
    workflowUpdatedAt: savedVersion.updatedAt?.toISOString ? savedVersion.updatedAt.toISOString() : new Date().toISOString(),
  };
  analysisState = ensureAnalysisTodos(analysisState, {
    workflow: workflowWithTasks,
    latestUserMessage: userMessageContent,
    intentSummary,
    workflowUpdatedAt: savedVersion.updatedAt?.toISOString
      ? savedVersion.updatedAt.toISOString()
      : new Date().toISOString(),
  });

  let analysisPersistenceError = false;
  const analysisPersistSpan = savingTrace.spanStart("analysis.persist", { automationVersionId: params.id });
  try {
    await upsertCopilotAnalysis({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      analysis: {
        ...analysisState,
        lastUpdatedAt: new Date().toISOString(),
      },
      workflowUpdatedAt: savedVersion.updatedAt ? new Date(savedVersion.updatedAt) : new Date(),
    });
    savingTrace.spanEnd(analysisPersistSpan, { ok: true, staleRun });
  } catch (analysisError) {
    analysisPersistenceError = true;
    savingTrace.event("analysis.persist_failed", {
      automationVersionId: params.id,
      error: analysisError instanceof Error ? analysisError.message : String(analysisError),
    });
    logger.error("[copilot:chat] Failed to persist copilot analysis", {
      automationVersionId: params.id,
      error: analysisError,
      stack: analysisError instanceof Error ? analysisError.stack : null,
    });
    copilotDebug(
      "copilot_chat.progress_persist_failed",
      analysisError instanceof Error ? analysisError.message : analysisError
    );
  }

  const updatedTasks = await fetchTasksForVersion(session.tenantId, params.id);

  savingTrace.event("run.completed", {
    stepCount: validatedWorkflow.steps?.length ?? 0,
    persistenceError: analysisPersistenceError,
  });

  buildEmitter.finalStage({
    stage: "done",
    title: "Build complete",
    detail: `Workflow ready with ${validatedWorkflow.steps?.length ?? 0} steps.`,
    progress: 100,
  });

  planner.emit("saving", "Run complete — preparing result…", {
    stepCount: validatedWorkflow.steps?.length ?? 0,
    persistenceError: analysisPersistenceError,
  });

  const result: CopilotRunResult = {
    runId,
    workflow: withLegacyWorkflowAlias(validatedWorkflow) as any,
    message: finalAssistantMessage,
    tasks: updatedTasks,
    completion: completionState,
    progress: progressSnapshot,
    prompt: commandExecuted
      ? null
      : {
          system: SYSTEM_PROMPT,
          contextSummary,
          messageCount: normalizedMessages.length,
        },
    commandExecuted,
    thinkingSteps,
    conversationPhase,
    persistenceError: analysisPersistenceError,
    proceedReady,
    proceedReason,
    proceedMessage,
    proceedUiStyle,
    readinessScore,
    readinessSignals: readinessSignals.signals,
    proceedBasicsMet,
    proceedThresholdMet,
  };

  callbacks?.onResult?.(result);
  return result;
}

async function buildIdempotentResponse(params: {
  run: CopilotRun;
  tenantId: string;
  automationVersionId: string;
  detail: AutomationVersionDetail;
}) {
  const workflowQuery = db
    .select({ workflowJson: automationVersions.workflowJson })
    .from(automationVersions)
    .where(and(eq(automationVersions.id, params.automationVersionId), eq(automationVersions.tenantId, params.tenantId)));
  const workflowRow =
    (typeof (workflowQuery as { limit?: (value: number) => unknown }).limit === "function"
      ? await (workflowQuery as { limit: (value: number) => unknown }).limit(1)
      : await workflowQuery) as Array<{ workflowJson: unknown }>;
  const workflow =
    workflowRow[0]?.workflowJson && typeof workflowRow[0].workflowJson === "object"
      ? (workflowRow[0].workflowJson as Workflow)
      : createEmptyWorkflowSpec();
  const messages = await listCopilotMessages({
    tenantId: params.tenantId,
    automationVersionId: params.automationVersionId,
  });
  const normalizedMessages = normalizeMessages(
    messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role as "user" | "assistant",
        content: message.role === "assistant" ? parseCopilotReply(message.content).displayText : message.content,
      }))
  );

  const assistantMessage =
    messages.find((message) => message.id === params.run.assistantMessageId) ??
    (await fetchAssistantMessage({
      tenantId: params.tenantId,
      automationVersionId: params.automationVersionId,
      assistantMessageId: params.run.assistantMessageId,
    }));

  if (!assistantMessage) {
    throw new ApiError(500, "Existing Copilot response not found for provided clientMessageId.");
  }

  const latestUserMessage = [...normalizedMessages].reverse().find((message) => message.role === "user");
  const completionState = getWorkflowCompletionState(workflow);

  let progressSnapshot = null;
  try {
    progressSnapshot = await evaluateWorkflowProgress({
      workflow,
      completionState,
      latestUserMessage: latestUserMessage?.content ?? null,
    });
  } catch (error) {
    copilotDebug(
      "copilot_chat.progress_eval_failed_replay",
      error instanceof Error ? error.message : error
    );
  }

  const commandExecuted = false;
  const conversationPhase = determineConversationPhase(workflow, normalizedMessages);
  const thinkingSteps = generateThinkingSteps(conversationPhase, latestUserMessage?.content, workflow);
  const tasks = await fetchTasksForVersion(params.tenantId, params.automationVersionId);

  return {
    runId: params.run.clientMessageId,
    workflow: withLegacyWorkflowAlias(workflow),
    message: assistantMessage,
    tasks,
    completion: completionState,
    progress: progressSnapshot,
    prompt: commandExecuted
      ? null
      : {
          system: SYSTEM_PROMPT,
          contextSummary: buildConversationSummary(
            normalizedMessages,
            params.detail.version.intakeNotes ?? null
          ),
          messageCount: normalizedMessages.length,
        },
    commandExecuted,
    thinkingSteps,
    conversationPhase,
  };
}

async function fetchAssistantMessage(params: {
  tenantId: string;
  automationVersionId: string;
  assistantMessageId: string;
}) {
  const assistantMessageQuery = db
    .select()
    .from(copilotMessages)
    .where(
      and(
        eq(copilotMessages.tenantId, params.tenantId),
        eq(copilotMessages.automationVersionId, params.automationVersionId),
        eq(copilotMessages.id, params.assistantMessageId)
      )
    );
  const assistantMessageRows =
    (typeof (assistantMessageQuery as { limit?: (value: number) => unknown }).limit === "function"
      ? await (assistantMessageQuery as { limit: (value: number) => unknown }).limit(1)
      : await assistantMessageQuery) as CopilotMessage[];
  const [message] = assistantMessageRows;

  return message ?? null;
}

async function fetchTasksForVersion(tenantId: string, automationVersionId: string) {
  return db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.tenantId, tenantId), eq(tasksTable.automationVersionId, automationVersionId)));
}

function normalizeMessages(messages: CopilotMessage[]): CopilotMessage[] {
  const trimmed = messages.slice(-MAX_MESSAGES).map((message) => {
    let content = message.content.trim();
    if (content.length > MAX_MESSAGE_CHARS) {
      content = `${content.slice(0, MAX_MESSAGE_CHARS)}…`;
    }
    return { ...message, content };
  });

  const totalChars = trimmed.reduce((sum, message) => sum + message.content.length, 0);
  if (totalChars <= MAX_TOTAL_CHARS) {
    return trimmed;
  }

  const result: CopilotMessage[] = [];
  let running = 0;
  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const candidate = trimmed[index];
    if (running + candidate.content.length > MAX_TOTAL_CHARS) {
      break;
    }
    running += candidate.content.length;
    result.unshift(candidate);
  }

  return result.length > 0 ? result : trimmed.slice(-3);
}

function isOffTopic(content: string) {
  const lower = content.toLowerCase();
  const mentionsAutomation = MIN_AUTOMATION_KEYWORDS.some((keyword) => lower.includes(keyword));
  const clearlyOffTopic = OFF_TOPIC_KEYWORDS.some((keyword) => lower.includes(keyword));
  return !mentionsAutomation && clearlyOffTopic;
}

function buildConversationSummary(messages: CopilotMessage[], intakeNotes?: string | null) {
  const summaryParts: string[] = [];
  const userMessages = messages.filter((message) => message.role === "user");
  const clipped = userMessages.slice(-3);

  summaryParts.push("Latest user instructions:");
  clipped.forEach((message, index) => {
    summaryParts.push(`${index + 1}. ${message.content}`);
  });

  if (intakeNotes) {
    summaryParts.push("\nIntake notes:\n");
    summaryParts.push(intakeNotes.slice(0, 2000));
  }

  return summaryParts.join("\n");
}

type FollowUpChoiceArgs = {
  candidate?: string | null;
  memory: CopilotMemory;
  latestUserMessage: string;
};

function isScheduleQuestion(text: string): boolean {
  const norm = normalizeQuestionText(text);
  if (!norm) return false;
  return /trigger|schedule|cadence|frequency|run|when start|how often|time of day/.test(norm);
}

function isDestinationQuestion(text: string): boolean {
  const norm = normalizeQuestionText(text);
  if (!norm) return false;
  return /destination|sheet|spreadsheet|csv|format|timestamp|output location/.test(norm);
}

function chooseFollowUpQuestion({
  candidate,
  memory,
  latestUserMessage,
}: FollowUpChoiceArgs): { question: string | null; key: string | null; droppedReason?: string } {
  const trimmed = candidate?.trim();
  const normalizedCandidate = trimmed ? normalizeQuestionText(trimmed) : null;
  const reachedCap = memory.question_count >= 10;
  const askedNormalized = memory.asked_questions_normalized ?? [];
  const lastQuestionNormalized = memory.lastQuestionText ? normalizeQuestionText(memory.lastQuestionText) : null;
  const latestUserNormalized = normalizeQuestionText(latestUserMessage);

  if (!trimmed) {
    return { question: null, key: null, droppedReason: "empty-candidate" };
  }

  if (reachedCap) {
    return { question: null, key: null, droppedReason: "question-cap" };
  }

  if (normalizedCandidate && (askedNormalized.includes(normalizedCandidate) || lastQuestionNormalized === normalizedCandidate)) {
    return { question: null, key: null, droppedReason: "duplicate" };
  }

  if (latestUserNormalized && normalizedCandidate === latestUserNormalized) {
    return { question: null, key: null, droppedReason: "echo-user-message" };
  }

  if (isScheduleQuestion(trimmed) && (memory.facts?.trigger_cadence || memory.facts?.trigger_time)) {
    return { question: null, key: null, droppedReason: "redundant-known-trigger" };
  }

  if (isDestinationQuestion(trimmed) && memory.facts?.storage_destination) {
    return { question: null, key: null, droppedReason: "technical-opt-in" };
  }

  return { question: trimmed, key: null };
}

const BANNED_OBJECTIVE_TERMS = [
  "business objective",
  "business objectives",
  "objective",
  "objectives",
  "business goal",
  "primary business goal",
  "goal for the business",
  "primary goal",
];

function isBannedObjectiveSentence(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return BANNED_OBJECTIVE_TERMS.some((term) => lower.includes(term));
}

function isSuccessQuestion(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return (
    /\b(success|kpi|kpis|sla|metric|measure|measurement|how .*success|what .*success)\b/i.test(lower) ||
    /\bdefine success\b/i.test(lower)
  );
}

function scrubResponseMessage(params: {
  response: string;
  lastQuestionText?: string | null;
  checklist: ChecklistState;
  whitelistNormalized?: string[];
}): string {
  const { response, lastQuestionText, checklist, whitelistNormalized } = params;
  if (!response?.trim()) return response;
  const sentences = response
    .split(/(?<=[\.\?\!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const lastNorm = lastQuestionText ? normalizeQuestionText(lastQuestionText) : null;
  const successConfirmed = checklist["success_criteria"]?.confirmed === true;

  const filtered = sentences.filter((sentence) => {
    const norm = normalizeQuestionText(sentence);
    if (!norm) return false;
    if (whitelistNormalized && whitelistNormalized.includes(norm)) return true;
    if (lastNorm && norm === lastNorm) return false;
    if (isBannedObjectiveSentence(sentence)) return false;
    if (successConfirmed && isSuccessQuestion(sentence)) return false;
    return true;
  });

  if (filtered.length === 0) {
    return response.trim().split(/\s+/).slice(0, 50).join(" ");
  }
  return filtered.join(" ");
}

type RefreshMemoryArgs = {
  previous: CopilotMemory;
  workflow: Workflow;
  lastUserMessage: string;
  appliedFollowUp?: string | null;
  followUpKey?: string | null;
};

function refreshMemoryState({
  previous,
  workflow,
  lastUserMessage,
  appliedFollowUp,
  followUpKey,
}: RefreshMemoryArgs): CopilotMemory {
  const mergedFacts = mergeFacts(previous.facts ?? {}, workflow, lastUserMessage);
  const normalizedFollowUp = appliedFollowUp ? normalizeQuestionText(appliedFollowUp) : null;
  const currentCount = previous.question_count ?? 0;
  const shouldIncrement = Boolean(appliedFollowUp && appliedFollowUp.trim().length > 0 && currentCount < 10);
  const newCount = shouldIncrement ? currentCount + 1 : currentCount;
  const checklist = ensureChecklist(previous);
  const nextStage = computeStage(mergedFacts, newCount, checklist);
  const asked = new Set(previous.asked_questions_normalized ?? []);
  if (normalizedFollowUp) {
    asked.add(normalizedFollowUp);
  }

  const didAskFollowUp = Boolean(appliedFollowUp && appliedFollowUp.trim().length > 0);
  const nextLastQuestionKey = didAskFollowUp ? normalizeKey(followUpKey ?? null) : previous.lastQuestionKey ?? null;
  const nextLastQuestionText = didAskFollowUp
    ? appliedFollowUp?.trim() ?? null
    : previous.lastQuestionText ?? null;

  return {
    summary_compact: buildMemorySummary(workflow, mergedFacts, lastUserMessage, previous.summary_compact),
    facts: mergedFacts,
    question_count: newCount,
    asked_questions_normalized: Array.from(asked).slice(-30),
    stage: nextStage,
    checklist,
    lastQuestionKey: nextLastQuestionKey,
    lastQuestionText: nextLastQuestionText,
  };
}

function mergeFacts(existing: CopilotMemory["facts"], workflow: Workflow, lastUserMessage: string): CopilotMemory["facts"] {
  const facts: CopilotMemory["facts"] = { ...(existing ?? {}) };

  const lower = lastUserMessage.toLowerCase();
  if (/daily|every day/.test(lower)) {
    facts.trigger_cadence = facts.trigger_cadence ?? "daily";
  }
  if (/weekly/.test(lower)) {
    facts.trigger_cadence = facts.trigger_cadence ?? "weekly";
  }
  const timeMatch = lastUserMessage.match(/\b(\d{1,2})(:?(\d{2}))?\s?(am|pm)\b/i);
  if (timeMatch && !facts.trigger_time) {
    facts.trigger_time = timeMatch[0];
  }

  workflow.sections?.forEach((section) => {
    const content = section.content?.trim();
    if (!content) return;
    switch (section.key) {
      case "business_requirements":
        facts.primary_outcome = facts.primary_outcome ?? truncateText(content, 160);
        break;
      case "business_objectives":
        facts.primary_outcome = facts.primary_outcome ?? truncateText(content, 160);
        break;
      case "success_criteria":
        facts.success_criteria = facts.success_criteria ?? truncateText(content, 160);
        break;
      case "systems":
        facts.systems = facts.systems ?? content.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 5);
        break;
      default:
        break;
    }
  });

  if (!facts.systems && workflow.steps?.length) {
    const systems = new Set<string>();
    workflow.steps.forEach((step) => {
      step.systemsInvolved?.forEach((system) => systems.add(system));
    });
    if (systems.size > 0) {
      facts.systems = Array.from(systems).slice(0, 5);
    }
  }

  if (!facts.storage_destination && workflow.summary) {
    const summaryLower = workflow.summary.toLowerCase();
    if (summaryLower.includes("sheet") || summaryLower.includes("excel")) {
      facts.storage_destination = "Google Sheets";
    }
  }

  if (!facts.samples) {
    const mentionsSamples =
      /invoice|receipt|ocr|pdf|document|template|scrape|scraping|crawler|extract|dataset|api|payload|webhook|endpoint/i.test(
        lastUserMessage
      );
    facts.samples = mentionsSamples ? "required" : "skip";
  }

  const lowerMessage = lastUserMessage.toLowerCase();
  const consentPositive =
    /technical/.test(lowerMessage) &&
    /(yes|sure|ok|okay|yep|yeah|go ahead|let's do|answer|fine|sounds good)/.test(lowerMessage);
  const consentNegative =
    /(lock it in|finalize|good to go|ship it|no more questions|skip technical|no thanks|no,|nah)/.test(
      lowerMessage
    ) || ( /technical/.test(lowerMessage) && /(no|not now|later|skip)/.test(lowerMessage));
  if (consentPositive) {
    (facts as any).technical_opt_in = true;
  } else if (consentNegative) {
    (facts as any).technical_opt_in = false;
  }

  const readinessSnapshot = deriveReadinessSignals({
    facts,
    workflow,
    latestUserMessage: lastUserMessage,
  });

  if (!facts.output_fields?.length && readinessSnapshot.evidence.outputFields?.length) {
    facts.output_fields = readinessSnapshot.evidence.outputFields.slice(0, 6);
  }

  if (!facts.scope_hint && readinessSnapshot.evidence.scopeHint) {
    facts.scope_hint = readinessSnapshot.evidence.scopeHint;
  }

  if (!facts.goal_summary && readinessSnapshot.evidence.goalSummary) {
    facts.goal_summary = truncateText(readinessSnapshot.evidence.goalSummary ?? "", 200);
  }

  if (!facts.storage_destination && readinessSnapshot.evidence.destinationDetail) {
    facts.storage_destination = readinessSnapshot.evidence.destinationDetail;
  }

  if (!facts.success_criteria && readinessSnapshot.signals.goal && readinessSnapshot.signals.trigger && readinessSnapshot.signals.destination && readinessSnapshot.signals.output && readinessSnapshot.signals.scope) {
    facts.success_criteria = composeInferredSuccessCriteria(readinessSnapshot.evidence);
    facts.success_criteria_evidence = {
      messageId: null,
      snippet: truncateText(lastUserMessage, 200),
      source: "inferred",
    };
  }

  return facts;
}

function computeStage(
  facts: CopilotMemory["facts"],
  questionCount: number,
  checklist?: ChecklistState
): CopilotMemory["stage"] {
  if (questionCount >= 10) {
    return "done";
  }

  const confirmedOr = (key: string, fallback: boolean) => (checklist ? checklist[key]?.confirmed === true : fallback);

  const hasRequirements = Boolean(
    confirmedOr("business_requirements", Boolean(facts.primary_outcome)) ||
      confirmedOr("business_objectives", Boolean(facts.primary_outcome))
  );
  const hasObjectives = Boolean(confirmedOr("business_objectives", Boolean(facts.primary_outcome)));
  const hasSuccess = Boolean(confirmedOr("success_criteria", Boolean(facts.success_criteria)));
  const hasSystems = Boolean(confirmedOr("systems", Boolean(facts.systems && facts.systems.length > 0)));

  if (!hasRequirements) return "requirements";
  if (!hasObjectives) return "objectives";
  if (!hasSuccess) return "success";
  if (!hasSystems) return "systems";

  return facts.samples === "required" ? "samples" : "done";
}

function buildStepsSummary(workflow: Workflow, limit = 6): string | null {
  if (!workflow?.steps || workflow.steps.length === 0) return null;
  const parts = workflow.steps.slice(0, limit).map((step, index) => {
    const name = step.name ?? `Step ${index + 1}`;
    const summary = step.description ?? step.summary ?? "";
    const systems = (step.systemsInvolved ?? []).slice(0, 3).join(", ");
    const extras = [summary, systems ? `systems: ${systems}` : null].filter(Boolean).join(" | ");
    return `${index + 1}. ${name}${extras ? ` — ${extras}` : ""}`;
  });
  return parts.join("\n").slice(0, 800);
}

function buildMemorySummary(
  workflow: Workflow,
  facts: CopilotMemory["facts"],
  lastUserMessage: string,
  previous?: string | null
): string {
  const parts: string[] = [];
  const summary = workflow.summary?.trim() || previous || "";
  if (summary) {
    parts.push(truncateText(summary, 200));
  }
  if (facts.primary_outcome) {
    parts.push(`Outcome: ${truncateText(facts.primary_outcome, 160)}`);
  }
  if (facts.success_criteria) {
    parts.push(`Success: ${truncateText(facts.success_criteria, 160)}`);
  }
  if (facts.systems?.length) {
    parts.push(`Systems: ${facts.systems.slice(0, 5).join(", ")}`);
  }
  if (facts.storage_destination) {
    parts.push(`Destination: ${facts.storage_destination}`);
  }
  if (facts.trigger_cadence || facts.trigger_time) {
    parts.push(`Trigger: ${[facts.trigger_cadence, facts.trigger_time].filter(Boolean).join(" ")}`);
  }
  if (parts.length === 0) {
    parts.push(truncateText(lastUserMessage, 200));
  }
  return truncateText(parts.join(" | "), 1200);
}

function normalizeQuestionText(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, limit: number): string {
  if (!value) return "";
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}


