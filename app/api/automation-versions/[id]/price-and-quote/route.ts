import { NextResponse } from "next/server";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { priceAndCreateQuoteForVersion } from "@/lib/services/pricing";

type RouteParams = {
  params: {
    id: string;
  };
};

type DiscountPayload = {
  code?: string | null;
  percent?: unknown;
  source?: "code" | "ops";
};

type ActionEstimatePayload = {
  actionType?: unknown;
  count?: unknown;
};

type PricePayload = {
  complexity?: unknown;
  estimatedVolume?: unknown;
  estimatedActions?: ActionEstimatePayload[];
  discounts?: DiscountPayload[];
  currency?: unknown;
  clientMessage?: unknown;
  notes?: unknown;
  discountCode?: unknown;
};

function parseComplexity(value: unknown): "basic" | "medium" | "complex_rpa" {
  if (typeof value !== "string") return "basic";
  const v = value.toLowerCase();
  if (v === "medium") return "medium";
  if (v === "complex_rpa" || v === "complex" || v === "rpa") return "complex_rpa";
  return "basic";
}

function parseNumber(value: unknown) {
  const num = typeof value === "string" ? Number(value) : Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function parseEstimatedActions(list?: ActionEstimatePayload[]) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      if (typeof item.actionType !== "string") return null;
      const count = parseNumber(item.count);
      if (count === undefined) return null;
      return { actionType: item.actionType, count: Math.max(0, count) };
    })
    .filter(Boolean) as { actionType: string; count: number }[];
}

function parseDiscounts(list?: DiscountPayload[]) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const percent = parseNumber(item.percent);
      if (percent === undefined) return null;
      const source = item.source ?? "code";
      if (source !== "code" && source !== "ops") return null;
      return {
        code: item.code ?? null,
        percent,
        source,
      };
    })
    .filter(Boolean) as Array<{ code: string | null; percent: number; source: "code" | "ops" }>;
}

async function parsePayload(request: Request): Promise<PricePayload> {
  try {
    return (await request.json()) as PricePayload;
  } catch {
    return {};
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "automation:version:transition", { type: "automation_version", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const payload = await parsePayload(request);
    const complexity = parseComplexity(payload.complexity);
    const estimatedVolume = parseNumber(payload.estimatedVolume);
    const estimatedActions = parseEstimatedActions(payload.estimatedActions);
    const discounts = parseDiscounts(payload.discounts);
    const currency = typeof payload.currency === "string" && payload.currency.trim() ? payload.currency.trim() : undefined;
    const clientMessage = typeof payload.clientMessage === "string" ? payload.clientMessage : undefined;
    const notes = typeof payload.notes === "string" ? payload.notes : undefined;
    const discountCode = typeof payload.discountCode === "string" ? payload.discountCode.trim() : undefined;

    const result = await priceAndCreateQuoteForVersion({
      tenantId: session.tenantId,
      automationVersionId: params.id,
      clientMessage,
      notes,
      discountCode,
      pricing: {
        complexity,
        estimatedVolume,
        estimatedActions,
        discounts,
        currency,
        // actionCatalog will be auto-loaded and cached inside the service
        actionCatalog: undefined as any, // will be replaced inside service
      },
    });

    return NextResponse.json(
      {
        quoteId: result.quoteId,
        projectId: result.projectId,
        automationVersionId: result.automationVersionId,
        pricing: result.pricing,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid discount code") {
      return NextResponse.json({ error: "Invalid discount code" }, { status: 400 });
    }
    return handleApiError(error);
  }
}

