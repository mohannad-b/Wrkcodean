import { NextResponse } from "next/server";
import { handleApiError, requireTenantSession, ApiError } from "@/lib/api/context";
import {
  buildProfileUpdate,
  getTenantScopedProfile,
  updateUserProfile,
  userProfileUpdateSchema,
} from "@/lib/user/profile";
import { logAudit } from "@/lib/audit/log";

export async function GET() {
  try {
    const session = await requireTenantSession();
    const result = await getTenantScopedProfile(session);

    if (!result) {
      throw new ApiError(404, "Profile not found");
    }

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

type PatchPayload = Record<string, unknown>;

async function parseJsonBody(request: Request): Promise<PatchPayload> {
  try {
    return (await request.json()) as PatchPayload;
  } catch {
    throw new ApiError(400, "Invalid JSON payload");
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireTenantSession();
    const rawPayload = await parseJsonBody(request);
    const parsed = userProfileUpdateSchema.safeParse(rawPayload);

    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      return NextResponse.json(
        {
          error: "Invalid profile data",
          fieldErrors: flattened.fieldErrors,
          formErrors: flattened.formErrors,
        },
        { status: 400 }
      );
    }

    const updates = buildProfileUpdate(parsed.data);

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          error: "No editable fields were provided.",
          fieldErrors: {},
          formErrors: ["No editable fields were provided."],
        },
        { status: 400 }
      );
    }

    const result = await updateUserProfile(session, updates);

    if (!result) {
      throw new ApiError(404, "Profile not found");
    }

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "user.profile.update",
      resourceType: "user",
      resourceId: result.profile.id,
      metadata: { changedFields: Object.keys(updates) },
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

