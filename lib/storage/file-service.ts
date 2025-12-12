import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { files, fileVersions, type File as FileRecord, type FileVersion } from "@/db/schema";
import { ApiError } from "@/lib/api/context";
import { logAudit } from "@/lib/audit/log";
import { storeLocalFile, storeFromUrl, deleteStoredFile, type StoredFilePayload } from "@/lib/storage/secure-file-storage";

export type UploadPurpose = "workspace_logo" | "task_attachment" | "automation_doc" | "generic";

type UploadParams =
  | {
      tenantId: string;
      userId: string;
      uploaderName?: string;
      purpose?: UploadPurpose;
      resourceType?: string | null;
      resourceId?: string | null;
      title?: string | null;
      versionOfFileId?: string | null;
      file: File;
      url?: undefined;
    }
  | {
      tenantId: string;
      userId: string;
      uploaderName?: string;
      purpose?: UploadPurpose;
      resourceType?: string | null;
      resourceId?: string | null;
      title?: string | null;
      versionOfFileId?: string | null;
      file?: undefined;
      url: string;
    };

type ListParams = {
  tenantId: string;
  resourceType?: string | null;
  resourceId?: string | null;
  purpose?: UploadPurpose;
};

export type FileWithLatest = FileRecord & { latest: FileVersion | null };

const ALLOWED_MIME_PREFIXES = [
  "image/",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/zip",
  "video/",
];

function isMimeAllowed(mime: string) {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

function buildDownloadUrl(versionId: string) {
  return `/api/uploads/${versionId}`;
}

async function persistFileVersion(fileRecord: FileRecord, stored: StoredFilePayload, userId: string) {
  const [inserted] = await db
    .insert(fileVersions)
    .values({
      id: randomUUID(),
      tenantId: fileRecord.tenantId,
      fileId: fileRecord.id,
      version: fileRecord.latestVersion,
      filename: stored.filename,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      checksumSha256: stored.checksumSha256,
      storageKey: stored.storageKey,
      storageUrl: stored.storageUrl ?? undefined,
      source: stored.source,
      sourceUrl: stored.sourceUrl ?? null,
      encryption: stored.encryption,
      status: "uploaded",
      createdBy: userId,
    })
    .returning();

  const downloadUrl = buildDownloadUrl(inserted.id);
  if (inserted.storageUrl !== downloadUrl) {
    const [updated] = await db
      .update(fileVersions)
      .set({ storageUrl: downloadUrl })
      .where(eq(fileVersions.id, inserted.id))
      .returning();
    return updated;
  }

  return inserted;
}

export async function uploadFile(params: UploadParams) {
  const purpose: UploadPurpose = params.purpose ?? "generic";
  const resourceType = params.resourceType ?? null;
  const resourceId = params.resourceId ?? null;
  const title = params.title?.trim() || null;

  if ("file" in params && params.file) {
    if (!isMimeAllowed(params.file.type || "application/octet-stream")) {
      throw new ApiError(400, "Unsupported file type.");
    }
  }

  let stored: StoredFilePayload;
  if ("file" in params && params.file) {
    stored = await storeLocalFile(params.file, params.tenantId);
  } else if ("url" in params && params.url) {
    stored = await storeFromUrl(params.url, params.tenantId);
    if (!isMimeAllowed(stored.mimeType)) {
      throw new ApiError(400, "Downloaded file type is not permitted.");
    }
  } else {
    throw new ApiError(400, "No file or URL provided.");
  }

  let fileRecord: FileRecord | undefined;
  if (params.versionOfFileId) {
    const [existing] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, params.versionOfFileId), eq(files.tenantId, params.tenantId)));
    if (!existing) {
      throw new ApiError(404, "File not found.");
    }
    const newVersion = (existing.latestVersion ?? 1) + 1;
    const [updated] = await db
      .update(files)
      .set({
        latestVersion: newVersion,
        updatedAt: new Date(),
        title: title ?? existing.title,
      })
      .where(eq(files.id, existing.id))
      .returning();
    fileRecord = updated;
  } else {
    const [created] = await db
      .insert(files)
      .values({
        tenantId: params.tenantId,
        createdBy: params.userId,
        purpose,
        resourceType,
        resourceId,
        title: title ?? stored.filename,
        latestVersion: 1,
      })
      .returning();
    fileRecord = created;
  }

  if (!fileRecord) {
    throw new ApiError(500, "Unable to persist file metadata.");
  }

  const versionRecord = await persistFileVersion(fileRecord, stored, params.userId);

  const uploaderName = params.uploaderName;

  await logAudit({
    tenantId: params.tenantId,
    userId: params.userId,
    action: "file.upload",
    resourceType: purpose,
    resourceId: fileRecord.id,
    metadata: {
      versionId: versionRecord.id,
      version: versionRecord.version,
      filename: versionRecord.filename,
      sizeBytes: versionRecord.sizeBytes,
      resourceType,
      resourceId,
      source: versionRecord.source,
      uploaderName,
      taskId: resourceId,
      workflowId: resourceType === "automation_version" ? resourceId : undefined,
    },
  });

  return { file: fileRecord, version: versionRecord };
}

export async function listFiles(params: ListParams): Promise<FileWithLatest[]> {
  const conditions = [eq(files.tenantId, params.tenantId)] as any[];
  if (params.purpose) conditions.push(eq(files.purpose, params.purpose));
  if (params.resourceType) conditions.push(eq(files.resourceType, params.resourceType));
  if (params.resourceId) conditions.push(eq(files.resourceId, params.resourceId));
  const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

  const rows = await db
    .select({
      file: files,
      latest: fileVersions,
    })
    .from(files)
    .leftJoin(
      fileVersions,
      and(
        eq(fileVersions.fileId, files.id),
        eq(fileVersions.version, files.latestVersion),
        eq(fileVersions.tenantId, params.tenantId)
      )
    )
    .where(whereClause)
    .orderBy(desc(files.updatedAt));

  return rows.map((row) => ({ ...row.file, latest: row.latest ?? null }));
}

export async function getVersionForDownload(versionId: string, tenantId: string) {
  const [row] = await db
    .select({
      version: fileVersions,
      file: files,
    })
    .from(fileVersions)
    .innerJoin(files, and(eq(files.id, fileVersions.fileId), eq(files.tenantId, tenantId)))
    .where(and(eq(fileVersions.id, versionId), eq(fileVersions.tenantId, tenantId)));

  if (!row) {
    throw new ApiError(404, "File not found.");
  }

  return row;
}

export async function deleteFileVersion(versionId: string, tenantId: string, actorUserId: string) {
  const [row] = await db
    .select({
      version: fileVersions,
      file: files,
    })
    .from(fileVersions)
    .innerJoin(files, and(eq(files.id, fileVersions.fileId), eq(files.tenantId, tenantId)))
    .where(and(eq(fileVersions.id, versionId), eq(fileVersions.tenantId, tenantId)));

  if (!row) {
    throw new ApiError(404, "File not found.");
  }

  await deleteStoredFile(row.version.storageKey);
  await db.delete(fileVersions).where(eq(fileVersions.id, versionId));

  const remaining = await db
    .select()
    .from(fileVersions)
    .where(and(eq(fileVersions.fileId, row.file.id), eq(fileVersions.tenantId, tenantId)))
    .orderBy(desc(fileVersions.version));

  if (remaining.length === 0) {
    await db.delete(files).where(eq(files.id, row.file.id));
  } else {
    await db
      .update(files)
      .set({ latestVersion: remaining[0].version, updatedAt: new Date() })
      .where(eq(files.id, row.file.id));
  }

  await logAudit({
    tenantId,
    userId: actorUserId,
    action: "file.delete",
    resourceType: row.file.purpose,
    resourceId: row.file.id,
    metadata: {
      versionId,
    },
  });
}


