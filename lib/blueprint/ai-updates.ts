import type { Blueprint, BlueprintSectionKey, BlueprintStep, BlueprintStepType } from "./types";

export type BlueprintUpdates = {
  steps?: Array<{
    id: string;
    title?: string;
    type?: BlueprintStepType;
    summary?: string;
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
  let stepsChanged = false;
  let sectionsChanged = false;

  if (updates.steps && updates.steps.length > 0) {
    steps = updates.steps.map((incoming) => normalizeIncomingStep(incoming));
    const indexMap = new Map<string, number>();
    steps.forEach((step, index) => indexMap.set(step.id, index));

    updates.steps.forEach((incoming) => {
      if (!incoming.id || !incoming.dependsOnIds) {
        return;
      }
      incoming.dependsOnIds.forEach((sourceId) => {
        const sourceIndex = indexMap.get(sourceId);
        if (sourceIndex === undefined) {
          return;
        }
        const sourceStep = steps[sourceIndex];
        if (!sourceStep.nextStepIds.includes(incoming.id)) {
          sourceStep.nextStepIds = [...sourceStep.nextStepIds, incoming.id];
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

  if (!stepsChanged && !sectionsChanged) {
    return blueprint;
  }

  return {
    ...blueprint,
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

  return {
    id,
    name: incoming.title ?? fallback?.name ?? id,
    type: incoming.type ?? fallback?.type ?? "Action",
    summary: incoming.summary?.trim() || fallback?.summary || "Summary pending",
    goalOutcome:
      incoming.outputs && incoming.outputs.length > 0
        ? incoming.outputs.join(", ")
        : fallback?.goalOutcome || "Outcome pending",
    responsibility: fallback?.responsibility ?? "Automated",
    systemsInvolved,
    timingSla: fallback?.timingSla,
    riskLevel: fallback?.riskLevel,
    notesExceptions: fallback?.notesExceptions,
    notifications: fallback?.notifications ?? [],
    notesForOps: fallback?.notesForOps,
    exceptionIds: fallback?.exceptionIds ?? [],
    nextStepIds: [],
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

