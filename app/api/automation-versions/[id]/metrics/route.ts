import { NextResponse } from "next/server";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import {
  getLatestMetricForVersion,
  getOrCreateMetricConfig,
  recordDailyMetricSnapshot,
  upsertMetricConfig,
} from "@/lib/services/automation-metrics";

type RouteParams = {
  params: { id: string };
};

type PatchPayload = {
  manualMinutesPerExecution?: unknown;
  hourlyRateUsd?: unknown;
};

type PostPayload = {
  asOfDate?: unknown;
  usage?: {
    totalExecutions?: unknown;
    successCount?: unknown;
    failureCount?: unknown;
    spendUsd?: unknown;
  };
};

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:read", { type: "automation", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const [config, latestMetric] = await Promise.all([
      getOrCreateMetricConfig(session.tenantId, params.id),
      getLatestMetricForVersion(session.tenantId, params.id),
    ]);

    return NextResponse.json({ config, latestMetric });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:metadata:update", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const payload = (await safeJson<PatchPayload>(request)) ?? {};
    const manualMinutes =
      typeof payload.manualMinutesPerExecution === "number"
        ? payload.manualMinutesPerExecution
        : typeof payload.manualMinutesPerExecution === "string"
          ? Number(payload.manualMinutesPerExecution)
          : undefined;
    const hourlyRate =
      typeof payload.hourlyRateUsd === "number"
        ? payload.hourlyRateUsd
        : typeof payload.hourlyRateUsd === "string"
          ? Number(payload.hourlyRateUsd)
          : undefined;

    if (manualMinutes === undefined && hourlyRate === undefined) {
      throw new ApiError(400, "No changes provided");
    }

    const updated = await upsertMetricConfig({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      manualMinutesPerExecution: manualMinutes,
      hourlyRateUsd: hourlyRate,
    });

    return NextResponse.json({ config: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:metadata:update", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const payload = (await safeJson<PostPayload>(request)) ?? {};
    const asOfDate =
      typeof payload.asOfDate === "string" || payload.asOfDate instanceof Date
        ? new Date(payload.asOfDate)
        : undefined;

    const usage = payload.usage
      ? {
          totalExecutions: numberOrZero(payload.usage.totalExecutions),
          successCount: numberOrZero(payload.usage.successCount),
          failureCount: numberOrZero(payload.usage.failureCount),
          spendUsd: numberOrZero(payload.usage.spendUsd),
          source: "wrk_platform_override",
        }
      : undefined;

    const snapshot = await recordDailyMetricSnapshot({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      asOfDate,
      usage,
    });

    return NextResponse.json({ metric: snapshot });
  } catch (error) {
    return handleApiError(error);
  }
}

async function safeJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function numberOrZero(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(parsed) ? parsed : 0;
}

