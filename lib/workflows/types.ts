export const WORKFLOW_SECTION_KEYS = [
  "business_requirements",
  "business_objectives",
  "success_criteria",
  "systems",
  "data_needs",
  "exceptions",
  "human_touchpoints",
  "flow_complete",
] as const;

export type WorkflowSectionKey = (typeof WORKFLOW_SECTION_KEYS)[number];

export const WORKFLOW_SECTION_TITLES: Record<WorkflowSectionKey, string> = {
  business_requirements: "Business Requirements",
  business_objectives: "Business Objectives",
  success_criteria: "Success Criteria",
  systems: "Systems",
  data_needs: "Data Needs",
  exceptions: "Exceptions",
  human_touchpoints: "Human Touchpoints",
  flow_complete: "Flow Complete",
};

export const WORKFLOW_SECTION_DEFINITIONS: { key: WorkflowSectionKey; title: string }[] = WORKFLOW_SECTION_KEYS.map(
  (key) => ({
    key,
    title: WORKFLOW_SECTION_TITLES[key],
  })
);

export type WorkflowProgressKey = "overview" | WorkflowSectionKey;
export const WORKFLOW_PROGRESS_KEY_ORDER: WorkflowProgressKey[] = ["overview", ...WORKFLOW_SECTION_KEYS];

// Canonical workflow status/type definitions. Blueprint aliases remain for backwards compatibility during migration.
export type WorkflowStatus = "Draft" | "ReadyForQuote" | "ReadyToBuild";

export type WorkflowStepType = "Trigger" | "Action" | "Decision" | "Exception" | "Human";

export type WorkflowResponsibility = "Automated" | "HumanReview" | "Approval";

export type WorkflowRiskLevel = "Low" | "Medium" | "High";

export interface WorkflowSection {
  id: string;
  key: WorkflowSectionKey;
  title: string;
  content: string;
}

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  name: string;
  summary: string;
  description: string;
  goalOutcome: string;
  responsibility: WorkflowResponsibility;
  notesExceptions?: string;
  systemsInvolved: string[];
  timingSla?: string;
  riskLevel?: WorkflowRiskLevel;
  notifications: string[];
  notesForOps?: string;
  exceptionIds?: string[];
  nextStepIds: string[];
  stepNumber: string;
  branchType?: "conditional" | "exception" | "parallel";
  branchCondition?: string;
  branchLabel?: string;
  parentStepId?: string;
  taskIds: string[];
}

export interface WorkflowBranch {
  id: string;
  parentStepId: string;
  condition: string;
  label: string;
  targetStepId: string;
}

export interface WorkflowSpec {
  version: 1;
  status: WorkflowStatus;
  summary: string;
  sections: WorkflowSection[];
  steps: WorkflowStep[];
  branches: WorkflowBranch[];
  createdAt: string;
  updatedAt: string;
  metadata?: {
    nodePositions?: Record<string, { x: number; y: number }>;
    skeleton?: boolean;
  };
}

// Legacy type aliases for backward compatibility during migration
export type Workflow = WorkflowSpec;
export type BlueprintSectionKey = WorkflowSectionKey;
export type BlueprintProgressKey = WorkflowProgressKey;
export type BlueprintStatus = WorkflowStatus;
export type BlueprintStepType = WorkflowStepType;
export type BlueprintResponsibility = WorkflowResponsibility;
export type BlueprintRiskLevel = WorkflowRiskLevel;
export interface BlueprintSection extends WorkflowSection {}
export interface BlueprintStep extends WorkflowStep {}
export interface BlueprintBranch extends WorkflowBranch {}
export interface Blueprint extends WorkflowSpec {}
export const BLUEPRINT_SECTION_KEYS = WORKFLOW_SECTION_KEYS;
export const BLUEPRINT_SECTION_TITLES = WORKFLOW_SECTION_TITLES;
export const BLUEPRINT_SECTION_DEFINITIONS = WORKFLOW_SECTION_DEFINITIONS;
export const BLUEPRINT_PROGRESS_KEY_ORDER = WORKFLOW_PROGRESS_KEY_ORDER;

