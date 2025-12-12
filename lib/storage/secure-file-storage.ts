import { randomUUID, createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { access } from "node:fs/promises";

export type EncryptionMetadata = {
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  keyFingerprint: string;
};

export type StoredFilePayload = {
  storageKey: string;
  storageUrl?: string;
  sizeBytes: number;
  mimeType: string;
  filename: string;
  checksumSha256: string;
  encryption: EncryptionMetadata;
  source: "upload" | "url";
  sourceUrl?: string;
};

const MAX_BYTES = Number(process.env.FILE_UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024); // 25MB default
const UPLOAD_ROOT = process.env.SECURE_UPLOAD_ROOT ?? path.join(process.cwd(), ".data", "secure-uploads");

function getKeyMaterial(): { key: Buffer; fingerprint: string } {
  const raw = process.env.FILE_ENCRYPTION_KEY ?? process.env.AVATAR_UPLOAD_SECRET ?? "local-dev-file-key";
  const key = createHash("sha256").update(raw).digest(); // 32 bytes
  const fingerprint = createHash("sha256").update(key).digest("hex").slice(0, 32);
  return { key, fingerprint };
}

function ensureUnderRoot(absPath: string) {
  const normalized = path.normalize(absPath);
  if (!normalized.startsWith(path.normalize(UPLOAD_ROOT))) {
    throw new Error("Invalid storage key path.");
  }
}

async function ensureDirectory(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function hashBuffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function encryptBuffer(buffer: Buffer): { ciphertext: Buffer; encryption: EncryptionMetadata } {
  const { key, fingerprint } = getKeyMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    encryption: {
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      keyFingerprint: fingerprint,
    },
  };
}

function decryptBuffer(ciphertext: Buffer, encryption: EncryptionMetadata): Buffer {
  const { key } = getKeyMaterial();
  const iv = Buffer.from(encryption.iv, "base64");
  const authTag = Buffer.from(encryption.authTag, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

async function persistEncryptedBuffer(params: {
  buffer: Buffer;
  tenantId: string;
  filename: string;
  mimeType: string;
  source: "upload" | "url";
  sourceUrl?: string;
}): Promise<StoredFilePayload> {
  const { buffer, tenantId, filename, mimeType, source, sourceUrl } = params;
  if (buffer.length === 0) {
    throw new Error("Cannot store an empty file.");
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error(`File exceeds maximum size of ${Math.round(MAX_BYTES / (1024 * 1024))}MB.`);
  }

  const checksumSha256 = hashBuffer(buffer);
  const { ciphertext, encryption } = encryptBuffer(buffer);

  const storageKey = path.join(tenantId, `${randomUUID()}.bin`);
  const abs = path.join(UPLOAD_ROOT, storageKey);
  ensureUnderRoot(abs);
  await ensureDirectory(path.dirname(abs));
  await fs.writeFile(abs, ciphertext);

  return {
    storageKey,
    sizeBytes: buffer.length,
    mimeType: mimeType || "application/octet-stream",
    filename: filename || "upload",
    checksumSha256,
    encryption,
    storageUrl: undefined,
    source,
    sourceUrl,
  };
}

function guessFilenameFromUrl(url: string, contentType?: string) {
  try {
    const parsed = new URL(url);
    const name = path.basename(parsed.pathname);
    if (name && name !== "/") {
      return name;
    }
  } catch {
    // ignore
  }
  if (contentType?.startsWith("image/")) return `downloaded-image.${contentType.split("/")[1] ?? "bin"}`;
  return "downloaded-file";
}

export async function storeLocalFile(file: File, tenantId: string): Promise<StoredFilePayload> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return persistEncryptedBuffer({
    buffer,
    tenantId,
    filename: file.name || "upload",
    mimeType: file.type || "application/octet-stream",
    source: "upload",
  });
}

export async function storeFromUrl(url: string, tenantId: string): Promise<StoredFilePayload> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are allowed.");
  }

  const response = await fetch(parsed);
  if (!response.ok) {
    throw new Error(`Unable to download file from URL. Status ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BYTES) {
    throw new Error(`Remote file exceeds maximum size of ${Math.round(MAX_BYTES / (1024 * 1024))}MB.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_BYTES) {
    throw new Error(`Remote file exceeds maximum size of ${Math.round(MAX_BYTES / (1024 * 1024))}MB.`);
  }

  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  const filename = guessFilenameFromUrl(url, mimeType);

  return persistEncryptedBuffer({
    buffer,
    tenantId,
    filename,
    mimeType,
    source: "url",
    sourceUrl: url,
  });
}

export async function readDecryptedFile(storageKey: string, encryption: EncryptionMetadata): Promise<Buffer> {
  const abs = path.join(UPLOAD_ROOT, storageKey);
  ensureUnderRoot(abs);
  const ciphertext = await fs.readFile(abs);
  return decryptBuffer(ciphertext, encryption);
}

export async function deleteStoredFile(storageKey: string) {
  const abs = path.join(UPLOAD_ROOT, storageKey);
  ensureUnderRoot(abs);
  try {
    await access(abs);
    await fs.unlink(abs);
  } catch {
    // ignore missing file
  }
}


