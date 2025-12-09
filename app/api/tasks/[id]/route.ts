import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { tasks } from "@/db/schema";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { db } from "@/db";

type RouteParams = {
  params: {
    id: string;
  };
};

const VALID_STATUSES = new Set(["pending", "in_progress", "complete"]);

type UpdateTaskPayload = {
  status?: unknown;
  description?: unknown;
  metadata?: unknown;
};

function parsePayload(body: UpdateTaskPayload) {
  const patch: Partial<typeof tasks.$inferSelect> = {};

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !VALID_STATUSES.has(body.status)) {
      throw new ApiError(400, "Invalid status");
    }
    patch.status = body.status as (typeof patch.status);
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      throw new ApiError(400, "description must be a string or null");
    }
    patch.description = body.description as (typeof patch.description);
  }

  if (body.metadata !== undefined) {
    if (body.metadata !== null && typeof body.metadata !== "object") {
      throw new ApiError(400, "metadata must be an object or null");
    }
    patch.metadata = body.metadata as Record<string, unknown> | null;
  }

  if (Object.keys(patch).length === 0) {
    throw new ApiError(400, "No valid fields provided.");
  }

  return patch;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:metadata:update", { type: "task", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const body = (await request.json()) as UpdateTaskPayload;
    const patch = parsePayload(body);

    const [existing] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, params.id), eq(tasks.tenantId, session.tenantId)));

    if (!existing) {
      throw new ApiError(404, "Task not found");
    }

    const [updated] = await db
      .update(tasks)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, params.id), eq(tasks.tenantId, session.tenantId)))
      .returning();

    return NextResponse.json({ task: updated });
  } catch (error) {
    return handleApiError(error);
  }
}


