import { NextResponse } from "next/server";
import { handleApiError, requireTenantSession, ApiError } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { logAudit } from "@/lib/audit/log";
import { getVersionForDownload } from "@/lib/storage/file-service";
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


