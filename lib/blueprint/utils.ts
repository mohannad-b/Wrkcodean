import type { Blueprint, BlueprintSectionKey } from "./types";
import { BLUEPRINT_SECTION_DEFINITIONS } from "./types";

export function isBlueprintEffectivelyEmpty(blueprint: Blueprint | null | undefined): boolean {
  if (!blueprint) return true;
  const summaryEmpty = blueprint.summary.trim().length === 0;
  const sectionsEmpty = blueprint.sections.every((section) => section.content.trim().length === 0);
  const noSteps = blueprint.steps.length === 0;
  return summaryEmpty && sectionsEmpty && noSteps;
}

export const SECTION_ORDER = BLUEPRINT_SECTION_DEFINITIONS.reduce<Record<BlueprintSectionKey, number>>(
  (acc, definition, index) => {
    acc[definition.key] = index;
    return acc;
  },
  {} as Record<BlueprintSectionKey, number>
);

export function sortSections(sections: Blueprint["sections"]) {
  return sections.slice().sort((a, b) => SECTION_ORDER[a.key] - SECTION_ORDER[b.key]);
}

export function timestampBlueprint(blueprint: Blueprint): Blueprint {
  const now = new Date().toISOString();
  return {
    ...blueprint,
    updatedAt: now,
  };
}

