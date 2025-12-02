export const BLUEPRINT_SECTION_KEYS = [
  "business_requirements",
  "business_objectives",
  "success_criteria",
  "systems",
  "data_needs",
  "exceptions",
  "human_touchpoints",
  "flow_complete",
] as const;

export type BlueprintSectionKey = (typeof BLUEPRINT_SECTION_KEYS)[number];

export const BLUEPRINT_SECTION_TITLES: Record<BlueprintSectionKey, string> = {
  business_requirements: "Business Requirements",
  business_objectives: "Business Objectives",
  success_criteria: "Success Criteria",
  systems: "Systems",
  data_needs: "Data Needs",
  exceptions: "Exceptions",
  human_touchpoints: "Human Touchpoints",
  flow_complete: "Flow Complete",
};

export const BLUEPRINT_SECTION_DEFINITIONS: { key: BlueprintSectionKey; title: string }[] = BLUEPRINT_SECTION_KEYS.map(
  (key) => ({
    key,
    title: BLUEPRINT_SECTION_TITLES[key],
  })
);

export type BlueprintStatus = "Draft" | "ReadyForQuote" | "ReadyToBuild";

export type BlueprintStepType = "Trigger" | "Action" | "Logic" | "Human";

export type BlueprintResponsibility = "Automated" | "HumanReview" | "Approval";

export type BlueprintRiskLevel = "Low" | "Medium" | "High";

export interface BlueprintSection {
  id: string;
  key: BlueprintSectionKey;
  title: string;
  content: string;
}

export interface BlueprintStep {
  id: string;
  type: BlueprintStepType;
  name: string;
  summary: string;
  goalOutcome: string;
  responsibility: BlueprintResponsibility;
  notesExceptions?: string;
  systemsInvolved: string[];
  timingSla?: string;
  riskLevel?: BlueprintRiskLevel;
  notifications: string[];
  notesForOps?: string;
  exceptionIds?: string[];
  nextStepIds: string[];
}

export interface Blueprint {
  version: 1;
  status: BlueprintStatus;
  summary: string;
  sections: BlueprintSection[];
  steps: BlueprintStep[];
  createdAt: string;
  updatedAt: string;
}

