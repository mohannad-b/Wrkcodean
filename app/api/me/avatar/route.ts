import { NextResponse } from "next/server";
import { handleApiError, requireTenantSession, ApiError } from "@/lib/api/context";
import { storeAvatarFile, AvatarStorageError } from "@/lib/storage/avatar-upload";
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

    const stored = await storeAvatarFile({
      file,
      tenantId: session.tenantId,
      userId: session.userId,
    });

    const result = await updateUserProfile(session, { avatarUrl: stored.url });

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
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AvatarStorageError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return handleApiError(error);
  }
}

