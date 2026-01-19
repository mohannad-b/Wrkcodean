export const fetchMembership = () =>
  fetch("/api/me/membership", { cache: "no-store" });
