import { logger } from "@/lib/logger";

logger.warn("[DEPRECATION] lib/services/projects is deprecated; migrate callers to lib/services/submissions.");

export {
  listSubmissionsForTenant as listProjectsForTenant,
  listSubmissionRequestsForTenant as listAutomationRequestsForTenant,
  getSubmissionDetail as getProjectDetail,
  createQuoteForSubmission as createQuoteForProject,
  updateQuoteStatus,
  signQuoteAndPromote,
  SigningError,
} from "@/lib/services/submissions";
