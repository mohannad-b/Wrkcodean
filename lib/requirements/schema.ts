export type RequirementTag =
  | "business_context"
  | "actors"
  | "data_sources"
  | "systems"
  | "triggers"
  | "actions"
  | "volume"
  | "sla"
  | "security"
  | "pricing"
  | "edge_cases"
  | "success_metrics"
  | "approvals"
  | "notifications"
  | "handoffs";

export type RequirementId = string;

export interface RequirementDefinition {
  id: RequirementId;
  label: string;
  prompt: string;
  tags: RequirementTag[];
  weight: number;
  dependsOn?: RequirementId[];
}

export const REQUIREMENTS: RequirementDefinition[] = [
  {
    id: "business-context-core",
    label: "Automation outcome",
    prompt: "What core outcome should this automation produce (e.g., update system, generate report, send alerts)?",
    tags: ["business_context", "success_metrics"],
    weight: 0.12,
  },
  {
    id: "triggers-definition",
    label: "Workflow triggers",
    prompt: "How should this automation run (schedule, event, manual)?",
    tags: ["triggers", "business_context"],
    weight: 0.1,
    dependsOn: ["business-context-core"],
  },
  {
    id: "actions-definition",
    label: "Key actions",
    prompt: "List the major actions the automation must perform once triggered.",
    tags: ["actions", "systems"],
    weight: 0.1,
    dependsOn: ["triggers-definition"],
  },
  {
    id: "systems-integrations",
    label: "Systems & integrations",
    prompt: "Which systems does this automation read from or update?",
    tags: ["systems", "security"],
    weight: 0.12,
    dependsOn: ["actions-definition"],
  },
  {
    id: "data-sources-primary",
    label: "Data needs",
    prompt: "What data fields do we need to capture?",
    tags: ["data_sources", "systems"],
    weight: 0.08,
    dependsOn: ["business-context-core"],
  },
  {
    id: "volume-frequency",
    label: "Volume & frequency",
    prompt: "How often does it run, and how many items per run?",
    tags: ["volume", "sla"],
    weight: 0.07,
  },
  {
    id: "slas-latency",
    label: "SLAs / latency",
    prompt: "What turnaround time or SLA do we need from trigger to completion?",
    tags: ["sla"],
    weight: 0.07,
    dependsOn: ["volume-frequency"],
  },
  {
    id: "actors-stakeholders",
    label: "Actors & stakeholders",
    prompt: "Who is involved before, during, or after the automation runs (teams, roles, approvers)?",
    tags: ["actors", "approvals"],
    weight: 0.06,
    dependsOn: ["business-context-core"],
  },
  {
    id: "success-metrics",
    label: "Success criteria",
    prompt: "How do we know the automation worked?",
    tags: ["success_metrics", "business_context"],
    weight: 0.06,
    dependsOn: ["business-context-core"],
  },
  {
    id: "edge-cases-failures",
    label: "Edge cases & failures",
    prompt: "How should errors or retries be handled? Any conditional paths or exceptions to consider?",
    tags: ["edge_cases", "actions"],
    weight: 0.05,
    dependsOn: ["actions-definition"],
  },
  {
    id: "security-compliance",
    label: "Security & compliance",
    prompt: "Are there PII, compliance, audit, or access requirements we must follow?",
    tags: ["security"],
    weight: 0.04,
  },
  {
    id: "pricing-constraints",
    label: "Pricing constraints",
    prompt: "Are there budget, savings, or pricing guardrails for this automation?",
    tags: ["pricing", "business_context"],
    weight: 0.04,
  },
  {
    id: "approvals-escalations",
    label: "Approvals & escalations",
    prompt: "Who approves, reviews, or escalates when something looks off?",
    tags: ["approvals", "actors"],
    weight: 0.04,
    dependsOn: ["actors-stakeholders"],
  },
  {
    id: "notifications-channels",
    label: "Notifications",
    prompt: "What notifications or alerts need to go out, to whom, and via which channel?",
    tags: ["notifications", "actions"],
    weight: 0.03,
    dependsOn: ["actions-definition"],
  },
  {
    id: "handoffs-human",
    label: "Human touchpoints",
    prompt: "Does a human review or approve anything?",
    tags: ["handoffs", "actors"],
    weight: 0.02,
    dependsOn: ["actions-definition", "actors-stakeholders"],
  },
];


