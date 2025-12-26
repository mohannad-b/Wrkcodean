import {
  listProjectsForTenant,
  listAutomationRequestsForTenant,
  getProjectDetail,
  createQuoteForProject,
} from "@/lib/services/projects";

console.warn("[DEPRECATION] lib/services/submissions is an alias over projects; update callers to submissions terminology.");

export {
  listProjectsForTenant as listSubmissionsForTenant,
  listAutomationRequestsForTenant as listSubmissionRequestsForTenant,
  getProjectDetail as getSubmissionDetail,
  createQuoteForProject as createQuoteForSubmission,
};

