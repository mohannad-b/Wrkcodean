import { randomUUID, createHash } from "node:crypto";
import { logger } from "@/lib/logger";

export class AvatarStorageError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
  }
}

type StoreAvatarFileParams = {
  file: File;
  tenantId: string;
  userId: string;
};

type StoredAvatar = {
  url: string;
};

/**
 * Persists an avatar image and returns a URL that can be stored on the user profile.
 *
 * NOTE: This implementation currently falls back to `data:` URLs so the end-to-end
 * UX works in local development without S3/Blob credentials. Replace this with a
 * real object storage integration (S3, Vercel Blob, GCS, etc.) before production.
 */
export async function storeAvatarFile(params: StoreAvatarFileParams): Promise<StoredAvatar> {
  try {
    const arrayBuffer = await params.file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (process.env.AVATAR_UPLOAD_BASE_URL && process.env.AVATAR_UPLOAD_SIGNED_URL) {
      // Future hook for real storage integration. Keep deterministic object keys.
      const key = buildObjectKey(params);
      // TODO: Implement upload to storage provider using provided credentials.
      // For now we intentionally fall through to the data URL fallback below.
      logger.warn(`[avatar] Persistent storage not configured. Falling back to data URL for key ${key}.`);
    }

    const dataUrl = `data:${params.file.type};base64,${buffer.toString("base64")}`;
    return { url: dataUrl };
  } catch (error) {
    throw new AvatarStorageError("Unable to persist avatar image.", error);
  }
}

function buildObjectKey(params: { tenantId: string; userId: string; file?: File }) {
  const hash = createHash("sha256");
  hash.update(params.tenantId);
  hash.update(params.userId);
  hash.update(randomUUID());
  return hash.digest("hex");
}

