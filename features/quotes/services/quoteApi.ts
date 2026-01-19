export const updateQuoteStatus = (quoteId: string, payload: Record<string, unknown>) =>
  fetch(`/api/quotes/${quoteId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
