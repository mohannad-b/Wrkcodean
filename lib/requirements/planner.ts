import type { RequirementDefinition } from "./schema";
import type { RequirementsState } from "./state";
import { RequirementStatus } from "./state";

export interface SuggestedNextStep {
  requirementId: string;
  title: string;
  question: string;
  reason: string;
}

export interface BundledRequirementsQuestion {
  bundledQuestion: string;
  bundledRequirementIds: string[];
  steps: string[];
}

type RequirementCandidate = {
  definition: RequirementDefinition;
  score: number;
};

const ASKED_PENALTY = 0.2;

const RECENT_ASK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function pickNextRequirementDefinitions(
  state: RequirementsState,
  definitions: RequirementDefinition[],
  maxCount: number
): RequirementDefinition[] {
  if (maxCount <= 0) {
    return [];
  }

  const candidates: RequirementCandidate[] = [];
  for (const definition of definitions) {
    const entry = state.items[definition.id];
    const status = entry?.status ?? RequirementStatus.NotAsked;
    if (status === RequirementStatus.Answered || status === RequirementStatus.Skipped) {
      continue;
    }

    if (status === RequirementStatus.Asked) {
      const lastAskedAt = entry?.lastAskedAt ? new Date(entry.lastAskedAt).getTime() : null;
      const now = Date.now();
      if (!lastAskedAt || now - lastAskedAt < RECENT_ASK_THRESHOLD_MS) {
        continue;
      }
    }

    const dependencies = definition.dependsOn ?? [];
    const dependenciesSatisfied = dependencies.every((dependencyId) => {
      const dependencyStatus = state.items[dependencyId]?.status ?? RequirementStatus.NotAsked;
      return dependencyStatus === RequirementStatus.Answered || dependencyStatus === RequirementStatus.Skipped;
    });
    if (!dependenciesSatisfied) {
      continue;
    }

    let score = definition.weight * 10;
    if (status === RequirementStatus.Asked) {
      score -= ASKED_PENALTY + 0.5;
    }

    candidates.push({ definition, score });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.definition.id.localeCompare(b.definition.id);
  });

  return candidates.slice(0, maxCount).map((candidate) => candidate.definition);
}

export function buildSuggestedNextSteps(
  state: RequirementsState,
  definitions: RequirementDefinition[],
  maxCount: number
): SuggestedNextStep[] {
  const nextDefinitions = pickNextRequirementDefinitions(state, definitions, maxCount);
  return nextDefinitions.map((definition) => ({
    requirementId: definition.id,
    title: definition.label,
    question: definition.prompt,
    reason: `We still need details about ${definition.label.toLowerCase()}.`,
  }));
}

export function bundleMissingRequirements(
  state: RequirementsState,
  definitions: RequirementDefinition[],
  maxCount: number
): BundledRequirementsQuestion | null {
  const limit = Math.max(1, Math.min(maxCount, 2));
  const candidates = pickNextRequirementDefinitions(state, definitions, limit).slice(0, limit);
  if (candidates.length === 0) {
    return null;
  }

  const requirementIds = candidates.map((candidate) => candidate.id);
  const labelList = candidates.map((candidate) => candidate.label.toLowerCase());

  const bundledQuestion =
    candidates.length === 1
      ? `Before I lock this in, can you tell me about ${labelList[0]}?`
      : `To set this up properly, I just need a quick sense of ${formatLabelList(
          labelList
        )}. Can you describe that in one message?`;

  return {
    bundledQuestion,
    bundledRequirementIds: requirementIds,
    steps: candidates.map((candidate) => candidate.label),
  };
}

function formatLabelList(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  const head = labels.slice(0, -1).join(", ");
  const tail = labels[labels.length - 1];
  return `${head}, and ${tail}`;
}


