import { NextResponse } from "next/server";
import { handleApiError, requireTenantSession, ApiError } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { logAudit } from "@/lib/audit/log";
import { deleteFileVersion, getVersionForDownload } from "@/lib/storage/file-service";
import { readDecryptedFile } from "@/lib/storage/secure-file-storage";

export const runtime = "nodejs";

type RouteParams = {
  params: {
    versionId: string;
  };
};

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();
    if (!can(session, "automation:read", { type: "automation", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }
    const { version, file } = await getVersionForDownload(params.versionId, session.tenantId);
    const url = new URL(request.url);
    const download = url.searchParams.get("download") === "1";

    const buffer = await readDecryptedFile(version.storageKey, version.encryption);
    const headers = new Headers();
    headers.set("Content-Type", version.mimeType || "application/octet-stream");
    headers.set("Content-Length", buffer.length.toString());
    headers.set("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(version.filename)}"`);

    // Add caching headers for images (especially avatars)
    const isImage = version.mimeType?.startsWith("image/");
    const isAvatar = file.resourceType === "user_avatar";
    
    if (isImage && !download) {
      // Cache images aggressively, especially avatars
      // Avatars can be cached for 1 year since they have unique URLs per version
      // Regular images can be cached for 30 days
      const maxAge = isAvatar ? 31536000 : 2592000; // 1 year for avatars, 30 days for other images
      headers.set("Cache-Control", `public, max-age=${maxAge}, immutable`);
      
      // Add ETag for better cache validation
      const etag = `"${version.id}-${version.sizeBytes}"`;
      headers.set("ETag", etag);
      
      // Check if client has cached version
      const ifNoneMatch = request.headers.get("If-None-Match");
      if (ifNoneMatch === etag) {
        return new NextResponse(null, { status: 304, headers });
      }
    } else if (!download) {
      // For non-image files, use shorter cache
      headers.set("Cache-Control", "public, max-age=3600"); // 1 hour
    }

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "file.access",
      resourceType: file.purpose,
      resourceId: file.id,
      metadata: {
        versionId: version.id,
        filename: version.filename,
        sizeBytes: version.sizeBytes,
      },
    });

    return new NextResponse(buffer, { headers });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();
    if (!can(session, "automation:metadata:update", { type: "automation", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }
    if (!params.versionId || params.versionId === "undefined") {
      throw new ApiError(400, "versionId is required");
    }
    await deleteFileVersion(params.versionId, session.tenantId, session.userId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}


