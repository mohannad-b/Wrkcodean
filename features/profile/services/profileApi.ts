export const fetchProfile = () =>
  fetch("/api/me/profile", { cache: "no-store" });

export const updateProfile = (body: Record<string, unknown>) =>
  fetch("/api/me/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const uploadAvatar = (form: FormData) =>
  fetch("/api/me/avatar", { method: "POST", body: form });
