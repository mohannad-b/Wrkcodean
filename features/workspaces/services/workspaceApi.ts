export const checkWorkspaceSlug = (slug: string) =>
  fetch(`/api/workspaces/check-slug?slug=${encodeURIComponent(slug)}`);

export const createWorkspace = (body: Record<string, unknown>) =>
  fetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const updateWorkspace = (body: Record<string, unknown>) =>
  fetch("/api/workspaces", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const fetchWorkspaces = () => fetch("/api/workspaces");
