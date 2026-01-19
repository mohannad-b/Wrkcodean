const DEBUG_UI_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_COPILOT_UI === "true";
const INGEST_URL = process.env.NEXT_PUBLIC_COPILOT_INGEST_URL ?? null;
const AGENT_LOG_URL = process.env.NEXT_PUBLIC_COPILOT_AGENT_LOG_URL ?? null;

export const isCopilotDebugUiEnabled = () => DEBUG_UI_ENABLED;

export const copilotAgentLogUrl = DEBUG_UI_ENABLED ? AGENT_LOG_URL : null;

export const copilotAgentFetch: typeof fetch = (input, init) => {
  if (!DEBUG_UI_ENABLED) {
    return Promise.resolve(new Response());
  }
  if (!input) {
    return Promise.resolve(new Response());
  }
  return fetch(input, init);
};

export const sendCopilotIngest = (payload: Record<string, unknown>) => {
  if (!INGEST_URL || process.env.NODE_ENV === "test") return;
  fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
};
