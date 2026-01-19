export const fetchAdminSubmissions = () =>
  fetch("/api/admin/submissions", { cache: "no-store" });

export const fetchAdminSubmissionDetail = (submissionId: string) =>
  fetch(`/api/admin/submissions/${submissionId}`, { cache: "no-store" });

export const updateAdminAutomationVersionStatus = (versionId: string, status: string) =>
  fetch(`/api/admin/automation-versions/${versionId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

export const createAdminSubmissionQuote = (submissionId: string, body: Record<string, unknown>) =>
  fetch(`/api/admin/submissions/${submissionId}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const sendAdminEmail = (body: Record<string, unknown>) =>
  fetch("/api/admin/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
