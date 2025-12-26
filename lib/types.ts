export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export interface AutomationSummary {
  id: string;
  name: string;
  description: string;
  department: string;
  owner: User;
  version: string;
  status: AutomationStatus;
  runs?: number;
  success?: number;
  spend?: number;
  updated: string;
  progress?: number;
}

export type AutomationStatus =
  | "Intake in Progress"
  | "Needs Pricing"
  | "Awaiting Client Approval"
  | "Build in Progress"
  | "QA & Testing"
  | "Ready to Launch"
  | "Live"
  | "Blocked"
  | "Archived";

export interface Collaborator {
  id: string;
  name: string;
  avatar: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  lastUpdated: string;
  health: "healthy" | "warning" | "error";
  status: "live" | "preview" | "draft";
  collaborators: Collaborator[];
  tags: string[];
}

export interface Notification {
  id: string;
  title: string;
  message?: string;
  time: string;
  type: "review" | "update" | "publish" | "comment";
  isUnread: boolean;
  actor?: Collaborator;
}

// Admin Console Types
export type ClientHealth = "Good" | "At Risk" | "Churn Risk";

export interface Client {
  id: string;
  name: string;
  industry: string;
  activeSpend: number;
  committedSpend: number;
  activeProjects: number;
  health: ClientHealth;
  owner: { name: string; avatar: string };
  lastActivity: string;
}

export type ProjectStatus =
  | "Intake in Progress"
  | "Needs Pricing"
  | "Awaiting Client Approval"
  | "Build in Progress"
  | "QA & Testing"
  | "Ready to Launch"
  | "Live"
  | "Blocked"
  | "Archived";

export type PricingStatus = "Not Generated" | "Draft" | "Sent" | "Signed";

export type MessageType = "client" | "ops" | "internal_note";

export interface AdminSubmission {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  version: string;
  type: "New Automation" | "Revision";
  status: ProjectStatus;
  checklistProgress: number;
  pricingStatus: PricingStatus;
  owner: { name: string; avatar: string; role?: string };
  eta: string;
  lastUpdated: string;
  lastUpdatedRelative: string;
  description?: string;
  systems?: string[];
  risk?: "Low" | "Medium" | "High";
  estimatedVolume?: number;
  setupFee?: number;
  unitPrice?: number;
  effectiveUnitPrice?: number;
}

export type AdminProject = AdminSubmission;

export interface SubmissionMessage {
  id: string;
  submissionId: string;
  type: MessageType;
  sender: {
    name: string;
    avatar?: string;
    role?: string;
  };
  text: string;
  timestamp: string;
  attachments?: string[];
  tags?: string[];
}

export type ProjectMessage = SubmissionMessage;

export interface SpendSummary {
  committedMonthlySpend: number;
  currentMonthSpend: number;
  setupFeesCollected: number;
  utilizationPercent: number;
}
