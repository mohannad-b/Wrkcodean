import type { Blueprint, BlueprintSectionKey, BlueprintStep, BlueprintStepType } from "./types";

export type BlueprintUpdates = {
  summary?: string | null;
  steps?: Array<{
    id: string;
    title?: string;
    type?: BlueprintStepType;
    summary?: string;
    goal?: string;
    systemsInvolved?: string[];
    inputs?: string[];
    outputs?: string[];
    dependsOnIds?: string[];
  }>;
  sections?: Partial<
    Record<
      BlueprintSectionKey,
      string | string[]
    >
  >;
  assumptions?: string[];
};

export function applyBlueprintUpdates(blueprint: Blueprint, updates: BlueprintUpdates): Blueprint {
  let steps = blueprint.steps.map((step) => ({
    ...step,
    nextStepIds: [...step.nextStepIds],
  }));
  let sections = blueprint.sections;
  let summary = blueprint.summary;
  let stepsChanged = false;
  let sectionsChanged = false;
  let summaryChanged = false;

  if (updates.summary && updates.summary.trim().length > 0) {
    const trimmed = updates.summary.trim();
    if (trimmed !== blueprint.summary) {
      summary = trimmed;
      summaryChanged = true;
    }
  }

  if (updates.steps && updates.steps.length > 0) {
    const normalizedSteps = updates.steps.map((incoming, index) =>
      normalizeIncomingStep(incoming, blueprint.steps[index])
    );
    const dependsLookup = new Map<string, string[]>();
    updates.steps.forEach((incoming, index) => {
      const normalizedId = normalizedSteps[index].id;
      let depends = (incoming.dependsOnIds ?? []).filter((id): id is string => Boolean(id));
      if (depends.length === 0 && index > 0) {
        depends = [normalizedSteps[index - 1].id];
      }
      dependsLookup.set(normalizedId, depends);
    });

    steps = normalizedSteps;
    const indexMap = new Map<string, number>();
    steps.forEach((step, index) => indexMap.set(step.id, index));

    steps.forEach((step) => {
      const dependsOnIds = dependsLookup.get(step.id);
      if (!dependsOnIds || dependsOnIds.length === 0) {
        return;
      }
      dependsOnIds.forEach((sourceId) => {
        const sourceIndex = indexMap.get(sourceId);
        if (sourceIndex === undefined) {
          return;
        }
        const sourceStep = steps[sourceIndex];
        if (!sourceStep.nextStepIds.includes(step.id)) {
          sourceStep.nextStepIds = [...sourceStep.nextStepIds, step.id];
        }
      });
    });

    stepsChanged = true;
  }

  if (updates.sections) {
    const sectionMap = new Map<BlueprintSectionKey, number>();
    sections.forEach((section, index) => {
      sectionMap.set(section.key, index);
    });

    for (const key of Object.keys(updates.sections) as BlueprintSectionKey[]) {
      const newValue = updates.sections[key];
      if (!newValue) {
        continue;
      }

      const index = sectionMap.get(key);
      if (index === undefined) {
        continue;
      }

      const existingContent = sections[index].content?.trim();
      if (existingContent) {
        continue;
      }

      let replacement: string | null = null;
      if (key === "systems") {
        const systemsArray = Array.isArray(newValue) ? newValue : [newValue];
        const uniqueSystems = Array.from(new Set(systemsArray.map((system) => system.trim()).filter(Boolean)));
        if (uniqueSystems.length > 0) {
          replacement = uniqueSystems.join(", ");
        }
      } else if (typeof newValue === "string" && newValue.trim().length > 0) {
        replacement = newValue.trim();
      }

      if (!replacement) {
        continue;
      }

      if (!sectionsChanged) {
        sections = sections.map((section) => ({ ...section }));
        sectionsChanged = true;
      }

      sections[index].content = replacement;
    }
  }

  if (!stepsChanged && !sectionsChanged && !summaryChanged) {
    return blueprint;
  }

  return {
    ...blueprint,
    summary: summaryChanged ? summary : blueprint.summary,
    steps: stepsChanged ? steps : blueprint.steps,
    sections: sectionsChanged ? sections : blueprint.sections,
  };
}

function normalizeIncomingStep(
  incoming: NonNullable<BlueprintUpdates["steps"]>[number],
  fallback?: BlueprintStep
): BlueprintStep {
  const id = incoming.id ?? generateStepId();
  const systems = normalizeStringArray(incoming.systemsInvolved);
  const systemsInvolved =
    systems.length > 0
      ? systems
      : fallback?.systemsInvolved && fallback.systemsInvolved.length > 0
      ? fallback.systemsInvolved
      : ["System TBD"];

  const stepType = normalizeStepType(incoming.type, fallback?.type);
  const description =
    incoming.summary?.trim() ??
    (incoming as { description?: string }).description?.trim() ??
    fallback?.description ??
    fallback?.summary ??
    "Description pending";

  return {
    id,
    name: incoming.title ?? (incoming as { name?: string }).name ?? fallback?.name ?? id,
    type: stepType,
    summary: incoming.summary?.trim() || fallback?.summary || "Summary pending",
    description,
    goalOutcome: resolveGoalOutcome(incoming.goal, incoming.outputs, fallback?.goalOutcome),
    responsibility:
      stepType === "Human" ? "HumanReview" : fallback?.responsibility ?? "Automated",
    systemsInvolved,
    timingSla: fallback?.timingSla,
    riskLevel: fallback?.riskLevel,
    notesExceptions: fallback?.notesExceptions,
    notifications: fallback?.notifications ?? [],
    notesForOps: fallback?.notesForOps,
    exceptionIds: fallback?.exceptionIds ?? [],
    nextStepIds: [],
    stepNumber: fallback?.stepNumber ?? "",
    branchType: fallback?.branchType,
    branchCondition: fallback?.branchCondition,
    branchLabel: fallback?.branchLabel,
    parentStepId: fallback?.parentStepId,
    taskIds: fallback?.taskIds ?? [],
  };
}

function normalizeStringArray(value: string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  const cleaned = value
    .map((item) => item.trim())
    .filter(Boolean);
  return cleaned;
}

function generateStepId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `step_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStepType(type?: string | null, fallback?: BlueprintStepType): BlueprintStepType {
  if (!type) {
    return fallback ?? "Action";
  }
  const normalized = type.trim().toLowerCase();
  if (normalized.includes("trigger") || normalized.includes("ingest") || normalized.includes("start")) {
    return "Trigger";
  }
  if (normalized.includes("logic") || normalized.includes("decision") || normalized.includes("branch")) {
    return "Decision";
  }
  if (normalized.includes("exception") || normalized.includes("error") || normalized.includes("fail")) {
    return "Exception";
  }
  if (normalized.includes("human") || normalized.includes("review") || normalized.includes("approval")) {
    return "Human";
  }
  if (normalized.includes("action") || normalized.includes("task") || normalized.includes("step")) {
    return "Action";
  }
  if ((["Trigger", "Action", "Decision", "Exception", "Human"] as BlueprintStepType[]).includes(type as BlueprintStepType)) {
    return type as BlueprintStepType;
  }
  return fallback ?? "Action";
}

function resolveGoalOutcome(goal?: string, outputs?: string[], fallback?: string): string {
  const cleanedGoal = goal?.trim();
  if (cleanedGoal) {
    return cleanedGoal;
  }
  const cleanedOutputs = (outputs ?? [])
    .map((item) => item.trim())
    .filter((item): item is string => Boolean(item));
  if (cleanedOutputs.length > 0) {
    return cleanedOutputs.join(", ");
  }
  return fallback ?? "Outcome pending";
}

