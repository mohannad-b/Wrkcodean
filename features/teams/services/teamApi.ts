export const fetchWorkspaceMembers = () =>
  fetch("/api/workspaces/members", { cache: "no-store" });

export const inviteWorkspaceMember = (body: Record<string, unknown>) =>
  fetch("/api/workspaces/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const updateWorkspaceMemberRole = (membershipId: string, role: string) =>
  fetch(`/api/workspaces/members/${membershipId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
