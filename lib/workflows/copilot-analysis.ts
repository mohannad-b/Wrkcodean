import { BLUEPRINT_SECTION_KEYS, type BlueprintProgressKey, type BlueprintSectionKey, type Workflow } from "./types";
import type { RequirementsState } from "@/lib/requirements/state";
import type { SuggestedNextStep } from "@/lib/requirements/planner";

export type CopilotSectionConfidence = "low" | "medium" | "high";
export type CopilotSectionSource = "user_input" | "ai_inferred" | "confirmed";

export interface CopilotSectionSnapshot {
  textSummary: string | null;
  confidence: CopilotSectionConfidence;
  source: CopilotSectionSource;
  missingInfo: string[];
}

export type CopilotSectionsSnapshot = Record<BlueprintSectionKey, CopilotSectionSnapshot>;

export type CopilotTodoCategory =
  | "systems_access"
  | "exceptions_mapping"
  | "data_mapping"
  | "human_touchpoints"
  | "flow_validation"
  | "requirements"
  | "business_objectives"
  | "success_criteria"
  | "business_requirements"
  | "systems"
  | "data_needs"
  | "exceptions"
  | "other";

export type CoreTodoKey = "business_requirements" | "business_objectives" | "success_criteria" | "systems";
export type CopilotTodoSource = "user" | "ai" | "system";

export interface CopilotTodoItem {
  id: string;
  key?: CoreTodoKey | string;
  category: CopilotTodoCategory;
  description: string;
  status: "open" | "resolved";
  confidence?: number;
  source?: CopilotTodoSource;
  value?: string | null;
  evidence?: string | null;
  question?: string | null;
  askedAt?: string | null;
  resolvedAt?: string | null;
  blockingStateItem?: string;
}

export type CopilotTouchpointChannel = "email" | "sms" | "slack" | "phone" | "other";

export interface CopilotHumanTouchpoint {
  description: string;
  who: string;
  channel: CopilotTouchpointChannel;
  when: string;
}

export interface CopilotReadiness {
  score: number;
  stateItemsSatisfied: string[];
  stateItemsMissing: string[];
  blockingTodos: string[];
  evidence?: ReadinessEvidence;
}

export type CopilotAssumptionStatus = "assumed" | "confirmed" | "rejected";

export interface CopilotAssumption {
  text: string;
  status: CopilotAssumptionStatus;
  source?: string;
}

export interface CopilotAnalysisState {
  sections: CopilotSectionsSnapshot;
  todos: CopilotTodoItem[];
  humanTouchpoints: CopilotHumanTouchpoint[];
  readiness: CopilotReadiness;
  memory?: CopilotMemory;
  version?: string;
  lastUpdatedAt?: string;
  requirementsState?: RequirementsState;
  suggestedNextSteps?: SuggestedNextStep[];
  progress?: BlueprintProgressSnapshot | null;
  stage?: CopilotStage;
  question_count?: number;
  asked_questions_normalized?: string[];
  facts?: CopilotMemoryFacts;
  assumptions?: CopilotAssumption[];
  lastUserMessageId?: string | null;
  lastAssistantMessageId?: string | null;
  workflowUpdatedAt?: string | null;
}

export type CopilotStage = "requirements" | "objectives" | "success" | "systems" | "samples" | "done";

export type CopilotMemoryFacts = {
  trigger_cadence?: string | null;
  trigger_time?: string | null;
  primary_outcome?: string | null;
  storage_destination?: string | null;
  systems?: string[] | null;
  exception_policy?: string | null;
  human_review?: string | null;
  success_criteria?: string | null;
  success_criteria_evidence?: {
    messageId?: string | null;
    snippet?: string | null;
    source?: string | null;
  } | null;
  output_fields?: string[] | null;
  output_shape?: string | null;
  scope_hint?: string | null;
  goal_summary?: string | null;
  samples?: string | null;
  proceed_ready?: boolean;
  proceed_reason?: string | null;
  proceed_ready_workflow_updated_at?: string | null;
  readiness_floor?: number | null;
  readiness_last_updated_at?: string | null;
  readiness_workflow_updated_at?: string | null;
};

export interface CopilotChecklistItem {
  key: string;
  confirmed: boolean;
  source?: "user" | "ai" | "assumed";
  value?: string | null;
  evidence?: string | null;
  confidence?: number;
  updatedAt?: string;
}

export interface CopilotMemory {
  summary_compact: string | null;
  facts: CopilotMemoryFacts;
  question_count: number;
  asked_questions_normalized: string[];
  stage: CopilotStage;
  checklist?: Record<string, CopilotChecklistItem>;
  lastQuestionKey?: string | null;
  lastQuestionText?: string | null;
}

export type BlueprintSectionProgressStatus = "not_started" | "in_progress" | "complete";

export interface BlueprintSectionProgressInsight {
  key: BlueprintProgressKey;
  score: number;
  status: BlueprintSectionProgressStatus;
  rationale: string;
  missingData?: string[];
}

export interface BlueprintProgressSnapshot {
  assessedAt: string;
  overallScore: number;
  missingInformation: string[];
  sections: BlueprintSectionProgressInsight[];
}

export const COPILOT_ANALYSIS_VERSION = "v1";

export function createEmptyCopilotAnalysisState(): CopilotAnalysisState {
  const todos = ensureCoreTodos([]);
  return {
    sections: createEmptySectionsSnapshot(),
    todos,
    humanTouchpoints: [],
    readiness: computeReadinessFromTodos(todos),
    memory: createEmptyMemory(),
    version: COPILOT_ANALYSIS_VERSION,
    lastUpdatedAt: new Date().toISOString(),
    progress: null,
    stage: "requirements",
    question_count: 0,
    asked_questions_normalized: [],
    facts: {},
    assumptions: [],
    lastUserMessageId: null,
    lastAssistantMessageId: null,
    workflowUpdatedAt: null,
  };
}

export function cloneCopilotAnalysisState(state: CopilotAnalysisState): CopilotAnalysisState {
  return {
    sections: Object.fromEntries(
      Object.entries(state.sections).map(([key, snapshot]) => [
        key as BlueprintSectionKey,
        {
          ...snapshot,
          missingInfo: [...snapshot.missingInfo],
        },
      ])
    ) as CopilotSectionsSnapshot,
    todos: state.todos.map((todo) => ({ ...todo })),
    humanTouchpoints: state.humanTouchpoints.map((touchpoint) => ({ ...touchpoint })),
    readiness: {
      ...state.readiness,
      stateItemsSatisfied: [...state.readiness.stateItemsSatisfied],
      stateItemsMissing: [...state.readiness.stateItemsMissing],
      blockingTodos: [...state.readiness.blockingTodos],
      evidence: state.readiness.evidence
        ? {
            ...state.readiness.evidence,
            outputFields: state.readiness.evidence.outputFields
              ? [...state.readiness.evidence.outputFields]
              : undefined,
          }
        : undefined,
    },
    memory: state.memory
      ? {
          summary_compact: state.memory.summary_compact,
          facts: { ...state.memory.facts },
          question_count: state.memory.question_count,
          asked_questions_normalized: [...state.memory.asked_questions_normalized],
          stage: state.memory.stage,
          checklist: state.memory.checklist ? { ...state.memory.checklist } : undefined,
          lastQuestionKey: state.memory.lastQuestionKey ?? null,
          lastQuestionText: state.memory.lastQuestionText ?? null,
        }
      : createEmptyMemory(),
    version: state.version ?? COPILOT_ANALYSIS_VERSION,
    lastUpdatedAt: state.lastUpdatedAt ?? new Date().toISOString(),
    requirementsState: state.requirementsState
      ? {
          blueprintId: state.requirementsState.blueprintId,
          items: Object.fromEntries(
            Object.entries(state.requirementsState.items).map(([key, value]) => [
              key,
              { ...value },
            ])
          ),
        }
      : undefined,
    suggestedNextSteps: state.suggestedNextSteps
      ? state.suggestedNextSteps.map((step) => ({ ...step }))
      : undefined,
    progress: state.progress
      ? {
          assessedAt: state.progress.assessedAt,
          overallScore: state.progress.overallScore,
          missingInformation: [...state.progress.missingInformation],
          sections: state.progress.sections.map((section) => ({ ...section })),
        }
      : null,
    stage: state.stage ?? state.memory?.stage ?? "requirements",
    question_count: state.question_count ?? state.memory?.question_count ?? 0,
    asked_questions_normalized:
      state.asked_questions_normalized ?? state.memory?.asked_questions_normalized ?? [],
    facts: state.facts ?? state.memory?.facts ?? {},
    assumptions: state.assumptions ? state.assumptions.map((a) => ({ ...a })) : [],
    lastUserMessageId: state.lastUserMessageId ?? null,
    lastAssistantMessageId: state.lastAssistantMessageId ?? null,
    workflowUpdatedAt: state.workflowUpdatedAt ?? null,
  };
}

export function summarizeAnalysisForPrompt(state: CopilotAnalysisState): string {
  const sectionSummaries = Object.entries(state.sections).map(([key, snapshot]) => ({
    key,
    summary: snapshot.textSummary,
    confidence: snapshot.confidence,
    missingInfo: snapshot.missingInfo.slice(0, 2),
  }));

  return JSON.stringify(
    {
      sections: sectionSummaries,
      openTodos: state.todos.filter((todo) => todo.status === "open").map((todo) => ({
        id: todo.id,
        category: todo.category,
        description: todo.description,
      })),
      readiness: state.readiness,
      humanTouchpoints: state.humanTouchpoints.slice(0, 5),
    },
    null,
    2
  );
}

export function createEmptySectionsSnapshot(): CopilotSectionsSnapshot {
  return BLUEPRINT_SECTION_KEYS.reduce<CopilotSectionsSnapshot>((acc, key) => {
    acc[key] = {
      textSummary: null,
      confidence: "low",
      source: "ai_inferred",
      missingInfo: [],
    };
    return acc;
  }, {} as CopilotSectionsSnapshot);
}

export function createEmptyReadiness(): CopilotReadiness {
  return {
    score: 0,
    stateItemsSatisfied: [],
    stateItemsMissing: [],
    blockingTodos: [],
  };
}

export const CORE_TODO_KEYS: CoreTodoKey[] = [
  "business_requirements",
  "business_objectives",
  "success_criteria",
  "systems",
];

export const CORE_TODO_DEFINITIONS: Record<
  CoreTodoKey,
  { category: CopilotTodoCategory; description: string; question: string }
> = {
  business_requirements: {
    category: "business_requirements",
    description: "Capture the business requirements and must-haves for this automation.",
    question: "What are the business requirements or must-haves for this automation?",
  },
  business_objectives: {
    category: "business_objectives",
    description: "Clarify the business goal or objective this automation supports.",
    question: "What is the primary business goal or objective this automation should achieve?",
  },
  success_criteria: {
    category: "success_criteria",
    description: "Define success criteria, KPIs, or SLAs for this automation.",
    question: "How will you measure success? Any KPIs or SLAs?",
  },
  systems: {
    category: "systems",
    description: "List the systems and tools involved in this workflow.",
    question: "Which systems or tools are involved in this workflow?",
  },
};

export function isCoreTodoKey(key?: string | null): key is CoreTodoKey {
  if (!key) return false;
  return CORE_TODO_KEYS.includes(key.trim().toLowerCase() as CoreTodoKey);
}

function normalizeTodoKey(key?: string | null) {
  return key?.trim().toLowerCase() ?? null;
}

export function ensureCoreTodos(existing: CopilotTodoItem[]): CopilotTodoItem[] {
  const byKey = new Map<string, CopilotTodoItem>();
  (existing ?? []).forEach((todo) => {
    const normalized = normalizeTodoKey(todo.key ?? todo.id ?? todo.category);
    if (normalized) {
      byKey.set(normalized, { ...todo, key: normalized });
    }
  });

  CORE_TODO_KEYS.forEach((key) => {
    const normalized = normalizeTodoKey(key)!;
    const def = CORE_TODO_DEFINITIONS[key];
    const existingTodo = byKey.get(normalized);
    if (!existingTodo) {
      byKey.set(normalized, {
        id: key,
        key,
        category: def.category,
        description: def.description,
        question: def.question,
        status: "open",
        confidence: 0,
        askedAt: null,
        resolvedAt: null,
      });
    } else {
      byKey.set(normalized, {
        ...existingTodo,
        key: existingTodo.key ?? key,
        category: existingTodo.category ?? def.category,
        description: existingTodo.description ?? def.description,
        question: existingTodo.question ?? def.question,
      });
    }
  });

  return Array.from(byKey.values());
}

export type ReadinessSignals = {
  goal: boolean;
  trigger: boolean;
  destination: boolean;
  output: boolean;
  scope: boolean;
};

export type ReadinessEvidence = {
  goalSummary?: string | null;
  triggerDetail?: string | null;
  destinationDetail?: string | null;
  outputFields?: string[];
  scopeHint?: string | null;
  cadence?: string | null;
  timeOfDay?: string | null;
};

type ReadinessContext = {
  facts?: CopilotMemoryFacts;
  workflow?: Workflow | null;
  sections?: Workflow["sections"];
  latestUserMessage?: string | null;
  previousScore?: number | null;
  signals?: Partial<ReadinessSignals>;
  evidence?: Partial<ReadinessEvidence>;
  workflowUpdatedAt?: string | null;
  readinessWorkflowUpdatedAt?: string | null;
};

function normalizeList(items: string[] | null | undefined, limit = 6): string[] {
  if (!items) return [];
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function findOutputFields(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const keywordMatch = text.match(
    /\b(include|with|fields|columns|capture|return|output|track|report|list)\s+([a-z0-9 ,\/\-&_]+?)(?=[\.\n]|$)/i
  );
  if (keywordMatch?.[2]) {
    return keywordMatch[2]
      .split(/,| and /i)
      .map((part) => part.replace(/[^a-z0-9\s\-\/&]+/gi, "").trim())
      .filter((part) => part.length > 1 && part.length <= 40)
      .slice(0, 6);
  }

  const listMatch = text.match(/([a-z0-9][a-z0-9\s\-\/&]{2,40}(?:\s*,\s*[a-z0-9][a-z0-9\s\-\/&]{1,40})+)/i);
  if (listMatch?.[1]) {
    return listMatch[1]
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 1 && part.length <= 40)
      .slice(0, 6);
  }

  if (/\bpdf report|summary|dashboard|export|sheet\b/i.test(lower)) {
    return ["summary", "report"];
  }
  return [];
}

function findScopeHint(text: string): string | null {
  if (!text) return null;
  const compact = text.trim().slice(0, 240);
  const prepositionMatch = compact.match(/\b(?:for|in|across|between)\s+([^.,;\n]{3,80})/i);
  if (prepositionMatch?.[1]) {
    return prepositionMatch[1].trim();
  }
  const andListMatch = compact.match(/\b([a-z]{2,}(?:\s[a-z]{2,})?)\s+and\s+([a-z]{2,}(?:\s[a-z]{2,})?)\b/i);
  if (andListMatch) {
    return `${andListMatch[1].trim()} and ${andListMatch[2].trim()}`;
  }
  const dateRange = compact.match(/\b\d{4}\b(?:\s*(?:to|through|-|–)\s*\d{4}\b)?/);
  if (dateRange?.[0]) {
    return dateRange[0];
  }
  return null;
}

export function deriveReadinessSignals(context: ReadinessContext): { signals: ReadinessSignals; evidence: ReadinessEvidence } {
  const facts = context.facts ?? {};
  const workflow = context.workflow ?? null;
  const sections = context.sections ?? workflow?.sections ?? [];
  const latestUserMessage = context.latestUserMessage ?? "";
  const textSources = [
    latestUserMessage,
    workflow?.summary ?? "",
    ...(sections?.map((section) => section.content ?? "") ?? []),
    facts.primary_outcome ?? "",
    facts.success_criteria ?? "",
  ].filter(Boolean);
  const combined = textSources.join("\n").toLowerCase();

  const outputsFromFacts = normalizeList(facts.output_fields ?? []);
  const outputsFromText = textSources.flatMap((text) => findOutputFields(text));
  const outputFields = normalizeList([...outputsFromFacts, ...outputsFromText]);

  const scopeFromFacts = facts.scope_hint ?? null;
  const scopeFromText = textSources.map((text) => findScopeHint(text)).find(Boolean) ?? null;
  const scopeHint = scopeFromFacts ?? scopeFromText ?? null;

  const goalSummary =
    facts.goal_summary ??
    workflow?.summary ??
    (facts.primary_outcome ? facts.primary_outcome : latestUserMessage ? latestUserMessage.slice(0, 160) : null);

  const triggerDetail =
    facts.trigger_cadence ||
    facts.trigger_time ||
    (workflow?.steps ?? []).find((step) => step.type === "Trigger")?.timingSla ||
    (combined.match(/\b(daily|weekly|monthly|hourly|every day|every week|every month)\b/i)?.[1] ?? null) ||
    null;
  const timeOfDay = facts.trigger_time ?? combined.match(/\b(\d{1,2})(:?(\d{2}))?\s?(am|pm)\b/i)?.[0] ?? null;

  const destinationDetail =
    facts.storage_destination ||
    normalizeList(facts.systems ?? [])[0] ||
    (sections ?? []).find((section) => section.key === "systems")?.content?.trim() ||
    (combined.match(/\b(google sheets?|sheet|spreadsheet|csv|notion|airtable|database|db|s3|bucket)\b/i)?.[1] ??
      null);

  const signals: ReadinessSignals = {
    goal:
      Boolean(goalSummary && goalSummary.trim().length > 6) ||
      Boolean((context.signals?.goal ?? false)) ||
      Boolean(combined.match(/\bautomate|workflow|process|goal\b/)),
    trigger: Boolean(context.signals?.trigger ?? Boolean(triggerDetail || timeOfDay)),
    destination: Boolean(context.signals?.destination ?? Boolean(destinationDetail)),
    output: Boolean(
      context.signals?.output ?? (outputFields.length > 0 || /report|export|dataset|payload/i.test(combined))
    ),
    scope: Boolean(context.signals?.scope ?? Boolean(scopeHint)),
  };

  return {
    signals,
    evidence: {
      goalSummary,
      triggerDetail,
      destinationDetail,
      outputFields,
      scopeHint,
      cadence: triggerDetail ?? facts.trigger_cadence ?? null,
      timeOfDay,
      ...context.evidence,
    },
  };
}

export function computeReadinessFromTodos(todos: CopilotTodoItem[], context: ReadinessContext = {}): CopilotReadiness {
  const ensured = ensureCoreTodos(todos ?? []);
  const { signals, evidence } = deriveReadinessSignals(context);
  const weights = { goal: 25, trigger: 20, destination: 20, output: 20, scope: 15 };
  const satisfied: string[] = [];
  const missing: string[] = [];
  const workflowUpdatedAt = context.workflowUpdatedAt ?? null;
  const readinessWorkflowUpdatedAt =
    context.readinessWorkflowUpdatedAt ?? context.facts?.readiness_workflow_updated_at ?? null;
  const stickyAllowed =
    !workflowUpdatedAt || !readinessWorkflowUpdatedAt || readinessWorkflowUpdatedAt === workflowUpdatedAt;

  const addState = (key: keyof ReadinessSignals, label: string) => {
    if (signals[key]) {
      satisfied.push(label);
    } else {
      missing.push(label);
    }
  };

  addState("goal", "goal_clarity");
  addState("trigger", "trigger");
  addState("destination", "destination");
  addState("output", "output_shape");
  addState("scope", "scope");

  const coreResolved = ensured.filter((todo) => isCoreTodoKey(todo.key ?? todo.id) && todo.status === "resolved");
  const readinessFloor = Math.max(
    stickyAllowed ? context.previousScore ?? 0 : 0,
    stickyAllowed ? context.facts?.readiness_floor ?? 0 : 0,
    coreResolved.length >= CORE_TODO_KEYS.length ? 85 : 0
  );

  let score =
    (signals.goal ? weights.goal : 0) +
    (signals.trigger ? weights.trigger : 0) +
    (signals.destination ? weights.destination : 0) +
    (signals.output ? weights.output : 0) +
    (signals.scope ? weights.scope : 0);

  // Allow a small boost if we have explicit evidence for outputs and scope together.
  if (signals.output && signals.scope && score < 90) {
    score += 5;
  }

  score = Math.round(Math.min(100, Math.max(score, readinessFloor)));

  const blockingTodos = [];
  if (!signals.trigger) blockingTodos.push("trigger");
  if (!signals.destination) blockingTodos.push("destination");

  return {
    score,
    stateItemsSatisfied: satisfied,
    stateItemsMissing: missing,
    blockingTodos,
    ...(evidence ? { evidence } : {}),
  };
}

export function createEmptyMemory(): CopilotMemory {
  return {
    summary_compact: null,
    facts: {},
    question_count: 0,
    asked_questions_normalized: [],
    stage: "requirements",
    checklist: {},
    lastQuestionKey: null,
    lastQuestionText: null,
  };
}

// Canonical workflow aliases
export type WorkflowSectionProgressInsight = BlueprintSectionProgressInsight;
export type WorkflowSectionProgressStatus = BlueprintSectionProgressStatus;
export type WorkflowProgressSnapshot = BlueprintProgressSnapshot;


