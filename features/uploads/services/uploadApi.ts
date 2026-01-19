type UploadQuery = Record<string, string | undefined>;

const buildUploadQuery = (params: UploadQuery) => {
  const entries = Object.entries(params).filter(([, value]) => value);
  return new URLSearchParams(entries as [string, string][]).toString();
};

export const fetchUploads = (params: UploadQuery) => {
  const query = buildUploadQuery(params);
  const path = query ? `/api/uploads?${query}` : "/api/uploads";
  return fetch(path);
};

export const fetchUploadHistory = (fileId: string) =>
  fetch(`/api/uploads/history/${fileId}`);

export const createUpload = (form: FormData) =>
  fetch("/api/uploads", { method: "POST", body: form });

export const deleteUploadVersion = (versionId: string) =>
  fetch(`/api/uploads/${versionId}`, { method: "DELETE" });
