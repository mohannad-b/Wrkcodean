import type { RequirementDefinition, RequirementId } from "./schema";

export enum RequirementStatus {
  NotAsked = "NotAsked",
  Asked = "Asked",
  Answered = "Answered",
  Skipped = "Skipped",
}

export interface RequirementAnswer {
  requirementId: RequirementId;
  status: RequirementStatus;
  answerSummary?: string;
  lastAskedAt?: string;
  lastUpdatedAt?: string;
}

export interface RequirementsState {
  blueprintId: string;
  items: Record<RequirementId, RequirementAnswer>;
}

export function initialRequirementsState(
  blueprintId: string,
  definitions: RequirementDefinition[]
): RequirementsState {
  const items: Record<RequirementId, RequirementAnswer> = {};
  for (const definition of definitions) {
    items[definition.id] = {
      requirementId: definition.id,
      status: RequirementStatus.NotAsked,
    };
  }
  return {
    blueprintId,
    items,
  };
}

function cloneState(state: RequirementsState): RequirementsState {
  return {
    blueprintId: state.blueprintId,
    items: { ...state.items },
  };
}

function getOrCreateAnswer(state: RequirementsState, requirementId: RequirementId): RequirementAnswer {
  return (
    state.items[requirementId] ?? {
      requirementId,
      status: RequirementStatus.NotAsked,
    }
  );
}

export function markAsked(state: RequirementsState, requirementId: RequirementId, timestamp: string): RequirementsState {
  const current = getOrCreateAnswer(state, requirementId);
  if (current.status === RequirementStatus.Answered || current.status === RequirementStatus.Skipped) {
    return state;
  }

  const nextState = cloneState(state);
  nextState.items[requirementId] = {
    ...current,
    status: RequirementStatus.Asked,
    lastAskedAt: timestamp,
    lastUpdatedAt: timestamp,
  };
  return nextState;
}

export function markAnswered(
  state: RequirementsState,
  requirementId: RequirementId,
  summary: string,
  timestamp: string
): RequirementsState {
  const current = getOrCreateAnswer(state, requirementId);
  const nextState = cloneState(state);
  nextState.items[requirementId] = {
    ...current,
    status: RequirementStatus.Answered,
    answerSummary: summary,
    lastUpdatedAt: timestamp,
    lastAskedAt: current.lastAskedAt,
  };
  return nextState;
}

export function markSkipped(state: RequirementsState, requirementId: RequirementId, timestamp: string): RequirementsState {
  const current = getOrCreateAnswer(state, requirementId);
  const nextState = cloneState(state);
  nextState.items[requirementId] = {
    ...current,
    status: RequirementStatus.Skipped,
    lastUpdatedAt: timestamp,
  };
  return nextState;
}

export function computeCompletion(state: RequirementsState, definitions: RequirementDefinition[]): number {
  const totalWeight = definitions.reduce((sum, definition) => sum + Math.max(definition.weight, 0), 0);
  if (totalWeight === 0) {
    return 0;
  }

  const completedWeight = definitions.reduce((sum, definition) => {
    const status = state.items[definition.id]?.status ?? RequirementStatus.NotAsked;
    if (status === RequirementStatus.Answered || status === RequirementStatus.Skipped) {
      return sum + definition.weight;
    }
    return sum;
  }, 0);

  return completedWeight / totalWeight;
}


