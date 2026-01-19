export const markWorkflowChatRead = (workflowId: string, lastReadMessageId: string) =>
  fetch(`/api/workflows/${workflowId}/chat/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lastReadMessageId }),
  });

export const fetchWorkflowMessages = (workflowId: string, options?: { limit?: number }) => {
  const query = options?.limit ? `?limit=${options.limit}` : "";
  return fetch(`/api/workflows/${workflowId}/chat/messages${query}`);
};

export const sendWorkflowMessage = (workflowId: string, body: Record<string, unknown>) =>
  fetch(`/api/workflows/${workflowId}/chat/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
