import { ApiError } from "@/lib/api/context";

export function requirePathParam(params: Record<string, string | string[] | undefined>, key: string): string {
  const value = params?.[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  throw new ApiError(400, `${key} is required`);
}

export async function parseJsonBody<T>(request: Request): Promise<T> {
  try {
    const body = (await request.json()) as T;
    return body;
  } catch {
    throw new ApiError(400, "Invalid JSON payload");
  }
}

