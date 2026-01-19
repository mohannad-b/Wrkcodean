export const fetchCopilotMessages = (versionId: string) =>
  fetch(`/api/automation-versions/${versionId}/messages`, { cache: "no-store" });

export const fetchCopilotAnalysis = (versionId: string) =>
  fetch(`/api/automation-versions/${versionId}/copilot/analysis`, { cache: "no-store" });

export const uploadCopilotFile = (formData: FormData) =>
  fetch("/api/uploads", {
    method: "POST",
    body: formData,
  });

export const sendCopilotChat = (versionId: string, body: Record<string, unknown>) =>
  fetch(`/api/automation-versions/${versionId}/copilot/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const sendCopilotChatStream = (
  versionId: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
) =>
  fetch(`/api/automation-versions/${versionId}/copilot/chat?stream=1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });
