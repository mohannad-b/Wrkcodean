import { logger } from "@/lib/logger";

logger.warn("[DEPRECATION] /api/admin/projects is deprecated; delegating to /api/admin/submissions.");

export { GET, POST } from "@/app/api/admin/submissions/route";


