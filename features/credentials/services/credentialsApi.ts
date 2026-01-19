export const createCredential = (body: Record<string, unknown>) =>
  fetch("/api/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
