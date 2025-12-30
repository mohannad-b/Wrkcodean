import { logger } from "@/lib/logger";

const DEBUG_ENABLED = process.env.DEBUG_COPILOT_LOGS === "true";

export function copilotDebug(message: string, payload?: unknown) {
  if (!DEBUG_ENABLED) {
    return;
  }

  if (payload === undefined) {
    logger.debug(`[copilot] ${message}`);
  } else {
    logger.debug(`[copilot] ${message}`, payload);
  }
}

