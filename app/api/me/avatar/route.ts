import { NextResponse } from "next/server";
import { handleApiError, requireTenantSession, ApiError } from "@/lib/api/context";
import { storeLocalFile } from "@/lib/storage/secure-file-storage";
import { uploadFile } from "@/lib/storage/file-service";
import { updateUserProfile } from "@/lib/user/profile";
import { logAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // 4 MB
const ALLOWED_AVATAR_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: Request) {
  try {
    const session = await requireTenantSession();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new ApiError(400, "Avatar upload must include a file field.");
    }

    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
      throw new ApiError(400, "Avatar must be a PNG, JPEG, or WebP image.");
    }

    if (file.size === 0) {
      throw new ApiError(400, "Uploaded avatar cannot be empty.");
    }

    if (file.size > MAX_AVATAR_BYTES) {
      throw new ApiError(400, "Avatar must be smaller than 4MB.");
    }

    // Upload file using the standard file upload system
    const uploadResult = await uploadFile({
      tenantId: session.tenantId,
      userId: session.userId,
      purpose: "generic",
      resourceType: "user_avatar",
      resourceId: session.userId,
      title: "Profile Avatar",
      file,
    });

    // Use the download URL from the file version
    const avatarUrl = `/api/uploads/${uploadResult.version.id}`;

    const result = await updateUserProfile(session, { avatarUrl });

    if (!result) {
      throw new ApiError(404, "Profile not found");
    }

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "user.avatar.update",
      resourceType: "user",
      resourceId: result.profile.id,
      metadata: {
        via: "self-service",
        fileId: uploadResult.file.id,
        versionId: uploadResult.version.id,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

