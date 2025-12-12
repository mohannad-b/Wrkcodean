import { NextResponse } from "next/server";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { listFiles, uploadFile, type UploadPurpose } from "@/lib/storage/file-service";

export const runtime = "nodejs";

const PURPOSES = new Set<UploadPurpose>(["workspace_logo", "task_attachment", "automation_doc", "generic"]);

function parsePurpose(value: FormDataEntryValue | null | undefined): UploadPurpose {
  if (typeof value === "string" && PURPOSES.has(value as UploadPurpose)) {
    return value as UploadPurpose;
  }
  return "generic";
}

export async function GET(request: Request) {
  try {
    const session = await requireTenantSession();
    if (!can(session, "automation:read", { type: "automation", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }
    const url = new URL(request.url);
    const resourceType = url.searchParams.get("resourceType");
    const resourceId = url.searchParams.get("resourceId");
    const purpose = url.searchParams.get("purpose");

    const files = await listFiles({
      tenantId: session.tenantId,
      resourceType: resourceType || undefined,
      resourceId: resourceId || undefined,
      purpose: purpose && PURPOSES.has(purpose as UploadPurpose) ? (purpose as UploadPurpose) : undefined,
    });

    return NextResponse.json({ files });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireTenantSession();
    if (!can(session, "automation:metadata:update", { type: "automation", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }
    const contentType = request.headers.get("content-type") ?? "";
    const isFormData = contentType.includes("multipart/form-data");

    if (!isFormData) {
      throw new ApiError(400, "Uploads must use multipart/form-data.");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const url = formData.get("url");
    const purpose = parsePurpose(formData.get("purpose"));
    const resourceType = (formData.get("resourceType") as string) || undefined;
    const resourceId = (formData.get("resourceId") as string) || undefined;
    const title = (formData.get("title") as string) || undefined;
    const versionOfFileId = (formData.get("versionOfFileId") as string) || undefined;

    if (!file && !url) {
      throw new ApiError(400, "Provide a file or a URL to upload.");
    }

    let result;
    if (file && file instanceof File) {
      result = await uploadFile({
        tenantId: session.tenantId,
        userId: session.userId,
        purpose,
        resourceType,
        resourceId,
        title,
        versionOfFileId,
        file,
      });
    } else if (url && typeof url === "string") {
      result = await uploadFile({
        tenantId: session.tenantId,
        userId: session.userId,
        purpose,
        resourceType,
        resourceId,
        title,
        versionOfFileId,
        url,
      });
    } else {
      throw new ApiError(400, "Invalid upload payload.");
    }

    return NextResponse.json({
      file: result.file,
      version: result.version,
      downloadUrl: result.version.storageUrl,
    });
  } catch (error) {
    return handleApiError(error);
  }
}


