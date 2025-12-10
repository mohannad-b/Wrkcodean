import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { parseQuoteStatus, fromDbQuoteStatus } from "@/lib/quotes/status";
import { fromDbAutomationStatus } from "@/lib/automations/status";
import { signQuoteAndPromote, SigningError } from "@/lib/services/projects";
import { logAudit } from "@/lib/audit/log";
import { verifySigningToken } from "@/lib/auth/signing-token";
import { db } from "@/db";
import { quotes } from "@/db/schema";

type RouteParams = {
  params: {
    id: string;
  };
};

type StatusPayload = {
  status?: unknown;
  last_known_updated_at?: string | null;
  signature_metadata?: Record<string, unknown> | null;
};

const PayloadSchema = z.object({
  status: z.string(),
  last_known_updated_at: z.string().optional().nullable(),
  signature_metadata: z.record(z.unknown()).optional().nullable(),
});

async function parsePayload(request: Request): Promise<StatusPayload> {
  try {
    return (await request.json()) as StatusPayload;
  } catch {
    return {};
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    // Try session first; if unavailable, try signing token.
    let session: Awaited<ReturnType<typeof requireTenantSession>> | null = null;
    let tokenPayload = null;
    try {
      session = await requireTenantSession();
    } catch {
      // ignore
    }

    if (!session) {
      const auth = request.headers.get("authorization") ?? "";
      const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
      if (token) {
        tokenPayload = verifySigningToken(token);
      }
      if (!tokenPayload) {
        throw new ApiError(401, "Unauthorized");
      }
    }

    const tenantId = session?.tenantId ?? tokenPayload?.tenantId ?? "";

    // If we have a signed token but no session, allow the token path to proceed without RBAC.
    const canUpdateQuote = session ? can(session, "admin:quote:update") : Boolean(tokenPayload);
    const canSignAsMember = session ? can(session, "automation:read", { type: "quote", tenantId }) : Boolean(tokenPayload);
    if (!canUpdateQuote && !canSignAsMember) {
      throw new ApiError(403, "Forbidden");
    }

    const rawPayload = await parsePayload(request);
    const parsedPayload = PayloadSchema.safeParse(rawPayload);
    if (!parsedPayload.success) {
      throw new ApiError(400, "invalid_payload");
    }

    const payload = parsedPayload.data;
    const nextStatus = parseQuoteStatus(payload.status);

    if (!nextStatus) {
      throw new ApiError(409, "invalid_quote_status");
    }

    if (nextStatus !== "SIGNED") {
      throw new ApiError(409, "invalid_quote_status");
    }

    const quoteRows = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, params.id), eq(quotes.tenantId, tenantId)))
      .limit(1);

    if (quoteRows.length === 0) {
      throw new ApiError(404, "Quote not found");
    }

    const result = await signQuoteAndPromote({
      tenantId,
      quoteId: params.id,
      lastKnownUpdatedAt: payload.last_known_updated_at,
      signatureMetadata: payload.signature_metadata,
    }).catch((error: unknown) => {
      if (error instanceof SigningError) {
        throw new ApiError(error.status, error.code);
      }
      if (error instanceof Error) {
        if (error.message.includes("Quote not found")) {
          throw new ApiError(404, error.message);
        }
      }
      throw error;
    });

    await logAudit({
      tenantId,
      userId: session?.userId ?? null,
      action: "automation.quote.accepted",
      resourceType: "quote",
      resourceId: params.id,
      metadata: {
        quoteStatus: { from: result.previousQuoteStatus, to: "SIGNED" },
        automationVersionId: result.automationVersion?.id ?? null,
        automationStatus: result.previousAutomationStatus
          ? { from: result.previousAutomationStatus, to: result.automationVersion ? fromDbAutomationStatus(result.automationVersion.status) : null }
          : null,
        projectId: result.project?.id ?? null,
        projectStatus: result.previousProjectStatus
          ? { from: result.previousProjectStatus, to: result.project ? fromDbAutomationStatus(result.project.status) : null }
          : null,
      },
    });

    return NextResponse.json({
      alreadyApplied: result.alreadyApplied ?? false,
      quote: {
        id: result.quote.id,
        status: fromDbQuoteStatus(result.quote.status),
        signedAt: result.quote.signedAt ?? null,
      },
      automationVersion: result.automationVersion
        ? {
            id: result.automationVersion.id,
            status: fromDbAutomationStatus(result.automationVersion.status),
          }
        : null,
      project: result.project
        ? {
            id: result.project.id,
            status: fromDbAutomationStatus(result.project.status),
          }
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}


