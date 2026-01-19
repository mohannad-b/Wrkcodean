const apiFetch = async (path: string, options: RequestInit) => {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data && data.error) || "Unexpected error";
    throw new Error(msg);
  }
  return data as Record<string, unknown>;
};

export const fetchOnboardingStatus = () => apiFetch("/api/me/onboarding", { method: "GET" });

export const submitPhone = (phone: string) => apiFetch("/api/me/phone", { method: "POST", body: JSON.stringify({ phone }) });

export const verifyPhone = (phone: string, code: string) =>
  apiFetch("/api/me/phone", { method: "PUT", body: JSON.stringify({ phone, code }) });

export const acceptTos = (version: string) =>
  apiFetch("/api/me/tos", { method: "POST", body: JSON.stringify({ version }) });
