export const fetchAutomationDetail = (automationId: string) =>
  fetch(`/api/automations/${automationId}`, { cache: "no-store" });

export const fetchAutomationVersionMetrics = (versionId: string) =>
  fetch(`/api/automation-versions/${versionId}/metrics`, { cache: "no-store" });

export const fetchAutomationVersionActivity = (
  versionId: string,
  limit = 3,
  options?: { signal?: AbortSignal }
) =>
  fetch(`/api/automation-versions/${versionId}/activity?limit=${limit}`, {
    cache: "no-store",
    signal: options?.signal,
  });

export const fetchAutomationVersionAnalysis = (versionId: string) =>
  fetch(`/api/automation-versions/${versionId}/copilot/analysis`, { cache: "no-store" });

export const updateAutomationMetrics = (versionId: string, body: Record<string, unknown>) =>
  fetch(`/api/automation-versions/${versionId}/metrics`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const updateAutomationVersion = (versionId: string, body: Record<string, unknown>) =>
  fetch(`/api/automation-versions/${versionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const createAutomationVersion = (automationId: string, body: Record<string, unknown>) =>
  fetch(`/api/automations/${automationId}/versions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const deleteAutomationVersion = (versionId: string) =>
  fetch(`/api/automation-versions/${versionId}`, { method: "DELETE" });

export const updateAutomationStatus = (versionId: string, status: string) =>
  fetch(`/api/automation-versions/${versionId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

export const optimizeAutomationVersion = (versionId: string, body: Record<string, unknown>) =>
  fetch(`/api/automation-versions/${versionId}/copilot/optimize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const generateAutomationTags = (versionId: string) =>
  fetch(`/api/automation-versions/${versionId}/copilot/tags`, { method: "POST" });

export const postAutomationVersionMessage = (versionId: string, body: Record<string, unknown>) =>
  fetch(`/api/automation-versions/${versionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const updateTask = (taskId: string, body: Record<string, unknown>) =>
  fetch(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const estimateAutomationActions = (versionId: string) =>
  fetch(`/api/automation-versions/${versionId}/estimate-actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

export const priceAutomationQuote = (versionId: string, body: Record<string, unknown>) =>
  fetch(`/api/automation-versions/${versionId}/price-and-quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
