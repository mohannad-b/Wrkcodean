import { BLUEPRINT_PROGRESS_KEY_ORDER, BLUEPRINT_SECTION_KEYS, type BlueprintProgressKey, type BlueprintSectionKey } from "./types";
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

export interface CopilotTodoItem {
  id: string;
  category: CopilotTodoCategory;
  description: string;
  status: "open" | "resolved";
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

export interface CopilotAnalysisState {
  sections: CopilotSectionsSnapshot;
  todos: CopilotTodoItem[];
  humanTouchpoints: CopilotHumanTouchpoint[];
  readiness: CopilotReadiness;
  version?: string;
  lastUpdatedAt?: string;
  requirementsState?: RequirementsState;
  suggestedNextSteps?: SuggestedNextStep[];
  progress?: BlueprintProgressSnapshot | null;
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
  return {
    sections: createEmptySectionsSnapshot(),
    todos: [],
    humanTouchpoints: [],
    readiness: createEmptyReadiness(),
    version: COPILOT_ANALYSIS_VERSION,
    lastUpdatedAt: new Date().toISOString(),
    progress: null,
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


