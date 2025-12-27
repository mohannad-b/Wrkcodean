import { NextResponse } from "next/server";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { listFiles, uploadFile, type UploadPurpose } from "@/lib/storage/file-service";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

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
    const contentType = request.headers.get("content-type") ?? "";
    const isFormData = contentType.includes("multipart/form-data");

    if (!isFormData) {
      throw new ApiError(400, "Uploads must use multipart/form-data.");
    }

    // Parse formData once
    const formData = await request.formData();
    const purpose = parsePurpose(formData.get("purpose"));
    const isWorkspaceLogoSetup = purpose === "workspace_logo" && formData.get("resourceId") === "setup";
    
    let session;
    let tenantId: string | null = null;
    
    if (isWorkspaceLogoSetup) {
      // Allow workspace logo uploads during setup without tenant
      const { getUserSession } = await import("@/lib/auth/session");
      const userSession = await getUserSession();
      session = {
        userId: userSession.userId,
        tenantId: null,
        roles: [],
      };
      tenantId = null; // Will be set when workspace is created
    } else {
      // Require tenant for all other uploads
      session = await requireTenantSession();
      tenantId = session.tenantId;
      if (!can(session, "automation:metadata:update", { type: "automation", tenantId: session.tenantId })) {
        throw new ApiError(403, "Forbidden");
      }
    }

    const file = formData.get("file");
    const url = formData.get("url");
    const resourceType = (formData.get("resourceType") as string) || undefined;
    const resourceId = (formData.get("resourceId") as string) || undefined;
    const title = (formData.get("title") as string) || undefined;
    const versionOfFileId = (formData.get("versionOfFileId") as string) || undefined;

    if (!file && !url) {
      throw new ApiError(400, "Provide a file or a URL to upload.");
    }

    let result;
    let uploaderName: string | undefined;
    try {
      const [uploader] = await db.select({ name: users.name }).from(users).where(eq(users.id, session.userId)).limit(1);
      uploaderName = uploader?.name ?? undefined;
    } catch {
      // ignore
    }
    
    // For workspace logo during setup, return the file URL for temporary storage
    // The frontend will store it and upload it properly after workspace creation
    if (isWorkspaceLogoSetup && tenantId === null) {
      // Store file temporarily and return URL
      const { storeLocalFile, storeFromUrl } = await import("@/lib/storage/secure-file-storage");
      let stored;
      
      if (file && file instanceof File) {
        // Use user ID as temporary tenant identifier for storage path
        stored = await storeLocalFile(file, `temp-${session.userId}`);
      } else if (url && typeof url === "string") {
        stored = await storeFromUrl(url, `temp-${session.userId}`);
      } else {
        throw new ApiError(400, "Invalid upload payload.");
      }
      
      // Return the storage URL for frontend to use
      // Format matches the normal response so frontend doesn't need special handling
      return NextResponse.json({
        file: null,
        version: {
          id: "temporary",
          storageUrl: stored.storageUrl,
        },
        downloadUrl: stored.storageUrl,
        temporary: true, // Flag to indicate this needs to be uploaded properly after workspace creation
      });
    }
    
    if (!tenantId) {
      throw new ApiError(400, "Tenant context required for file uploads.");
    }
    
    if (file && file instanceof File) {
      result = await uploadFile({
        tenantId,
        userId: session.userId,
        purpose,
        resourceType,
        resourceId,
        title,
        versionOfFileId,
        file,
        uploaderName,
      });
    } else if (url && typeof url === "string") {
      result = await uploadFile({
        tenantId,
        userId: session.userId,
        purpose,
        resourceType,
        resourceId,
        title,
        versionOfFileId,
        url,
        uploaderName,
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


