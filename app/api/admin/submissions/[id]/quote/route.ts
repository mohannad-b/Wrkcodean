import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { can } from "@/lib/auth/rbac";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { db } from "@/db";
import { submissions } from "@/db/schema";
import { createQuoteForSubmission } from "@/lib/services/submissions";
import { logAudit } from "@/lib/audit/log";
import { fromDbQuoteStatus } from "@/lib/quotes/status";

type RouteParams = {
  params: {
    id: string;
  };
};

type QuotePayload = {
  setupFee?: unknown;
  unitPrice?: unknown;
  estimatedVolume?: unknown;
  clientMessage?: unknown;
};

async function parsePayload(request: Request): Promise<QuotePayload> {
  try {
    return (await request.json()) as QuotePayload;
  } catch {
    return {};
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "admin:quote:create", { type: "quote", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const payload = await parsePayload(request);
    const setupFee = Number(payload.setupFee);
    const unitPrice = Number(payload.unitPrice);

    if (!Number.isFinite(setupFee) || !Number.isFinite(unitPrice)) {
      throw new ApiError(400, "setupFee and unitPrice are required");
    }

    const submissionRows = await db
      .select()
      .from(submissions)
      .where(and(eq(submissions.id, params.id), eq(submissions.tenantId, session.tenantId)))
      .limit(1);

    if (submissionRows.length === 0) {
      throw new ApiError(404, "Submission not found");
    }

    if (!submissionRows[0].automationVersionId) {
      throw new ApiError(400, "Submission is missing automation version");
    }

    const quote = await createQuoteForSubmission({
      tenantId: session.tenantId,
      automationVersionId: submissionRows[0].automationVersionId,
      setupFee,
      unitPrice,
      estimatedVolume: typeof payload.estimatedVolume === "number" ? payload.estimatedVolume : undefined,
      clientMessage: typeof payload.clientMessage === "string" ? payload.clientMessage : undefined,
    });

    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      action: "automation.quote.generated",
      resourceType: "quote",
      resourceId: quote.id,
      metadata: { submissionId: params.id, automationVersionId: submissionRows[0].automationVersionId },
    });

    return NextResponse.json(
      {
        quote: {
          id: quote.id,
          status: fromDbQuoteStatus(quote.status),
          setupFee: quote.setupFee,
          unitPrice: quote.unitPrice,
          estimatedVolume: quote.estimatedVolume,
          clientMessage: quote.clientMessage,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}

