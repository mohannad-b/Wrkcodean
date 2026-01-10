import { BLUEPRINT_SECTION_KEYS, type BlueprintProgressKey, type BlueprintSectionKey } from "./types";
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
  samples?: string | null;
  proceed_ready?: boolean;
  proceed_reason?: string | null;
  proceed_ready_workflow_updated_at?: string | null;
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

export function computeReadinessFromTodos(todos: CopilotTodoItem[]): CopilotReadiness {
  const ensured = ensureCoreTodos(todos ?? []);
  const missing = ensured.filter((todo) => isCoreTodoKey(todo.key ?? todo.id) && todo.status !== "resolved");
  const satisfied = ensured.filter((todo) => isCoreTodoKey(todo.key ?? todo.id) && todo.status === "resolved");
  const totalCore = CORE_TODO_KEYS.length;
  const score = totalCore === 0 ? 100 : Math.round((satisfied.length / totalCore) * 100);

  return {
    score,
    stateItemsSatisfied: satisfied.map((todo) => todo.key ?? todo.id),
    stateItemsMissing: missing.map((todo) => todo.key ?? todo.id),
    blockingTodos: missing.map((todo) => todo.id),
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


