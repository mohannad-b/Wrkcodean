import type { Blueprint, BlueprintSectionKey } from "./types";

export interface BlueprintSectionCompletion {
  key: BlueprintSectionKey;
  complete: boolean;
}

export interface BlueprintCompletionState {
  score: number; // value between 0 and 1
  sections: BlueprintSectionCompletion[];
  summaryComplete: boolean;
  hasTrigger: boolean;
  hasAction: boolean;
  stepCoverage: number;
}

const SECTION_WEIGHT = 0.45;
const SUMMARY_WEIGHT = 0.1;
const TRIGGER_WEIGHT = 0.2;
const ACTION_WEIGHT = 0.2;
const STEP_DEPTH_WEIGHT = 0.05;

const MIN_SECTION_LENGTH = 160;
const MIN_SUMMARY_LENGTH = 60;

export function getBlueprintCompletionState(blueprint: Blueprint | null | undefined): BlueprintCompletionState {
  if (!blueprint) {
    return {
      score: 0,
      sections: [],
      summaryComplete: false,
      hasTrigger: false,
      hasAction: false,
      stepCoverage: 0,
    };
  }

  const cleanedSections = blueprint.sections.map<BlueprintSectionCompletion>((section) => ({
    key: section.key,
    complete: section.content.trim().length >= MIN_SECTION_LENGTH,
  }));

  const summaryComplete = blueprint.summary.trim().length >= MIN_SUMMARY_LENGTH;
  const hasTrigger = blueprint.steps.some((step) => step.type === "Trigger");
  const hasAction = blueprint.steps.some((step) => step.type === "Action");
  const stepCount = blueprint.steps.length;
  const enrichedSteps = blueprint.steps.filter(
    (step) => step.summary.trim().length > 0 && step.goalOutcome.trim().length > 0 && step.systemsInvolved.length > 0
  ).length;
  const stepDepthRatio = stepCount === 0 ? 0 : enrichedSteps / stepCount;

  const sectionContribution =
    cleanedSections.length === 0
      ? 0
      : (cleanedSections.filter((section) => section.complete).length / cleanedSections.length) * SECTION_WEIGHT;

  const summaryContribution = summaryComplete ? SUMMARY_WEIGHT : 0;
  const triggerContribution = hasTrigger ? TRIGGER_WEIGHT : 0;
  const actionContribution = hasAction ? ACTION_WEIGHT : 0;
  const depthContribution = stepDepthRatio * STEP_DEPTH_WEIGHT;

  const totalScore = Math.min(
    1,
    Number(
      (sectionContribution + summaryContribution + triggerContribution + actionContribution + depthContribution).toFixed(3)
    )
  );

  return {
    score: totalScore,
    sections: cleanedSections,
    summaryComplete,
    hasTrigger,
    hasAction,
    stepCoverage: stepDepthRatio,
  };
}

