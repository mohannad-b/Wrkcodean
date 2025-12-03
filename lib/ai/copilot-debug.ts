const DEBUG_ENABLED = process.env.DEBUG_COPILOT_LOGS === "true";

export function copilotDebug(message: string, payload?: unknown) {
  if (!DEBUG_ENABLED) {
    return;
  }

  if (payload === undefined) {
    console.debug(`[copilot] ${message}`);
  } else {
    console.debug(`[copilot] ${message}`, payload);
  }
}

