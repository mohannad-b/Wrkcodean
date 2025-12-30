import { logger } from "@/lib/logger";

logger.warn("[DEPRECATION] /api/admin/projects/[id]/quote is deprecated; delegating to /api/admin/submissions/[id]/quote.");

export { POST } from "@/app/api/admin/submissions/[id]/quote/route";


