import { BLUEPRINT_SECTION_KEYS, type Blueprint, type BlueprintSectionKey } from "./types";

export interface BlueprintSectionCompletion {
  key: BlueprintSectionKey;
  complete: boolean;
  progress: number;
}

export interface BlueprintCompletionState {
  score: number; // value between 0 and 1
  sections: BlueprintSectionCompletion[];
  summaryComplete: boolean;
  summaryProgress: number;
  hasTrigger: boolean;
  hasAction: boolean;
  stepCoverage: number;
}

const SECTION_WEIGHT = 0.45;
const SUMMARY_WEIGHT = 0.1;
const TRIGGER_WEIGHT = 0.2;
const ACTION_WEIGHT = 0.2;
const STEP_DEPTH_WEIGHT = 0.05;

const DEFAULT_SECTION_TARGET = 160;
const MIN_SUMMARY_LENGTH = 60;
const MIN_FLOW_STEPS = 3;

const SECTION_COMPLETION_TARGETS: Partial<Record<BlueprintSectionKey, number>> = {
  business_requirements: 180,
  business_objectives: 150,
  success_criteria: 150,
  systems: 140,
  data_needs: 140,
  exceptions: 120,
  human_touchpoints: 120,
  flow_complete: 1,
};

const PLACEHOLDER_REGEX = /\b(pending|tbd|unknown)\b/i;

const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max);
const average = (...values: number[]) => {
  if (!values.length) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return clamp(total / values.length);
};

const createEmptySectionProgress = (): BlueprintSectionCompletion[] =>
  BLUEPRINT_SECTION_KEYS.map((key) => ({
    key,
    progress: 0,
    complete: false,
  }));

const hasMeaningfulContent = (value?: string | null, minLength = 4): boolean => {
  if (!value) {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    return false;
  }
  return !PLACEHOLDER_REGEX.test(trimmed);
};

export function getBlueprintCompletionState(blueprint: Blueprint | null | undefined): BlueprintCompletionState {
  if (!blueprint) {
    return {
      score: 0,
      sections: createEmptySectionProgress(),
      summaryComplete: false,
      summaryProgress: 0,
      hasTrigger: false,
      hasAction: false,
      stepCoverage: 0,
    };
  }

  const summaryLength = hasMeaningfulContent(blueprint.summary, 12) ? blueprint.summary.trim().length : 0;
  const summaryProgress = clamp(summaryLength / MIN_SUMMARY_LENGTH);
  const hasTrigger = blueprint.steps.some((step) => step.type === "Trigger");
  const hasAction = blueprint.steps.some((step) => step.type === "Action");
  const stepCount = blueprint.steps.length;

  let enrichedSteps = 0;
  let definedGoalSteps = 0;
  let definedSummarySteps = 0;
  let notificationsSteps = 0;
  let exceptionSteps = 0;
  let decisionSteps = 0;
  let humanSteps = 0;
  const systems = new Set<string>();

  blueprint.steps.forEach((step) => {
    if (hasMeaningfulContent(step.summary, 8)) {
      definedSummarySteps += 1;
    }
    if (hasMeaningfulContent(step.goalOutcome, 6)) {
      definedGoalSteps += 1;
    }
    if (hasMeaningfulContent(step.summary, 8) && hasMeaningfulContent(step.goalOutcome, 6) && step.systemsInvolved.length > 0) {
      enrichedSteps += 1;
    }
    if ((step.notifications?.length ?? 0) > 0) {
      notificationsSteps += 1;
    }
    if (step.type === "Exception" || step.branchType === "exception") {
      exceptionSteps += 1;
    }
    if (step.type === "Decision") {
      decisionSteps += 1;
    }
    if (step.type === "Human" || step.responsibility === "HumanReview" || step.responsibility === "Approval") {
      humanSteps += 1;
    }
    step.systemsInvolved.forEach((system) => {
      const trimmed = system?.trim();
      if (trimmed && trimmed !== "System TBD") {
        systems.add(trimmed);
      }
    });
  });

  const stepDepthRatio = stepCount === 0 ? 0 : enrichedSteps / stepCount;
  const goalCoverage = stepCount === 0 ? 0 : definedGoalSteps / stepCount;
  const detailCoverage = stepCount === 0 ? 0 : definedSummarySteps / stepCount;
  const notificationsCoverage = stepCount === 0 ? 0 : notificationsSteps / stepCount;
  const systemCoverage = clamp(systems.size / 3);
  const stepMomentum = clamp(stepCount / 4);
  const exceptionCoverage = clamp(exceptionSteps / 2);
  const decisionCoverage = clamp(decisionSteps / 2);
  const humanCoverage = clamp(humanSteps / 2);

  const sectionContentMap = new Map<BlueprintSectionKey, string>();
  blueprint.sections.forEach((section) => {
    sectionContentMap.set(section.key, section.content?.trim() ?? "");
  });

  const contentProgressLookup = new Map<BlueprintSectionKey, number>();
  BLUEPRINT_SECTION_KEYS.forEach((key) => {
    if (key === "flow_complete") {
      contentProgressLookup.set(key, 0);
      return;
    }
    const rawContent = sectionContentMap.get(key) ?? "";
    const target = SECTION_COMPLETION_TARGETS[key] ?? DEFAULT_SECTION_TARGET;
    const length = hasMeaningfulContent(rawContent, 12) ? rawContent.length : 0;
    const progress = length === 0 ? 0 : clamp(length / target);
    contentProgressLookup.set(key, progress);
  });

  const flowCompleteStats = computeFlowCompletion({
    steps: blueprint.steps,
    hasTrigger,
    hasAction,
    stepDepthRatio,
  });

  const derivedSectionSignals: Record<BlueprintSectionKey, number> = {
    business_requirements: average(summaryProgress, stepMomentum),
    business_objectives: average(summaryProgress, goalCoverage),
    success_criteria: average(goalCoverage, detailCoverage, notificationsCoverage),
    systems: average(systemCoverage, stepDepthRatio),
    data_needs: average(stepDepthRatio, goalCoverage),
    exceptions: average(exceptionCoverage, decisionCoverage),
    human_touchpoints: humanCoverage,
    flow_complete: flowCompleteStats.progress,
  };

  const sectionProgress = BLUEPRINT_SECTION_KEYS.map<BlueprintSectionCompletion>((key) => {
    if (key === "flow_complete") {
      return flowCompleteStats;
    }
    const contentProgress = contentProgressLookup.get(key) ?? 0;
    const derived = derivedSectionSignals[key] ?? 0;
    const progress = clamp(Math.max(contentProgress, derived));
    return {
      key,
      progress,
      complete: progress >= 1,
    };
  });

  const summaryComplete = summaryProgress >= 1;

  const sectionContribution =
    sectionProgress.length === 0
      ? 0
      : (sectionProgress.reduce((total, section) => total + section.progress, 0) / sectionProgress.length) * SECTION_WEIGHT;

  const summaryContribution = summaryProgress * SUMMARY_WEIGHT;
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
    sections: sectionProgress,
    summaryComplete,
    summaryProgress,
    hasTrigger,
    hasAction,
    stepCoverage: stepDepthRatio,
  };
}

function computeFlowCompletion(params: {
  steps: Blueprint["steps"];
  hasTrigger: boolean;
  hasAction: boolean;
  stepDepthRatio: number;
}): BlueprintSectionCompletion {
  const { steps, hasTrigger, hasAction, stepDepthRatio } = params;
  const hasMinimumSteps = steps.length >= MIN_FLOW_STEPS;
  const hasDepth = stepDepthRatio >= 0.5;
  const requirements = [hasMinimumSteps, hasTrigger, hasAction, hasDepth];
  const progress = clamp(requirements.filter(Boolean).length / requirements.length);
  return {
    key: "flow_complete",
    progress,
    complete: progress >= 1,
  };
}

