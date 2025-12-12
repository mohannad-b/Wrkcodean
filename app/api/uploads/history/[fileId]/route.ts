import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { handleApiError, requireTenantSession, ApiError } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { db } from "@/db";
import { files, fileVersions, users } from "@/db/schema";

type RouteParams = {
  params: {
    fileId: string;
  };
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();
    if (!can(session, "automation:read", { type: "automation", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const [fileRow] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, params.fileId), eq(files.tenantId, session.tenantId)));

    if (!fileRow) {
      throw new ApiError(404, "File not found");
    }

    const versions = await db
      .select({
        id: fileVersions.id,
        fileId: fileVersions.fileId,
        tenantId: fileVersions.tenantId,
        version: fileVersions.version,
        filename: fileVersions.filename,
        mimeType: fileVersions.mimeType,
        sizeBytes: fileVersions.sizeBytes,
        checksumSha256: fileVersions.checksumSha256,
        storageKey: fileVersions.storageKey,
        storageUrl: fileVersions.storageUrl,
        source: fileVersions.source,
        sourceUrl: fileVersions.sourceUrl,
        encryption: fileVersions.encryption,
        status: fileVersions.status,
        createdBy: fileVersions.createdBy,
        createdAt: fileVersions.createdAt,
        uploaderName: users.name,
        uploaderAvatar: users.avatarUrl,
      })
      .from(fileVersions)
      .leftJoin(users, eq(users.id, fileVersions.createdBy))
      .where(and(eq(fileVersions.fileId, params.fileId), eq(fileVersions.tenantId, session.tenantId)))
      .orderBy(desc(fileVersions.version));

    return NextResponse.json({ file: fileRow, versions });
  } catch (error) {
    return handleApiError(error);
  }
}


