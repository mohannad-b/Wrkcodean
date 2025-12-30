import { describe, it, expect, beforeEach, vi } from "vitest";

const getSessionMock = vi.fn();
const canMock = vi.fn();
const updateQuoteStatusMock = vi.fn();
const signQuoteAndPromoteMock = vi.fn();
const logAuditMock = vi.fn();
const requireTenantSessionMock = vi.fn();

const limitMock = vi.fn();
const whereMock = vi.fn(() => ({ limit: limitMock }));
const fromMock = vi.fn(() => ({ where: whereMock }));
const selectMock = vi.fn(() => ({ from: fromMock }));
const insertValuesMock = vi.fn().mockResolvedValue(undefined);
const insertMock = vi.fn(() => ({ values: insertValuesMock }));

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@/lib/api/context", () => ({
  requireTenantSession: requireTenantSessionMock,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  handleApiError: (error: any) =>
    new Response(JSON.stringify({ error: error.message }), { status: error.status ?? 500 }),
}));

vi.mock("@/lib/auth/rbac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/rbac")>("@/lib/auth/rbac");
  return {
    ...actual,
    can: canMock,
    AuthorizationError: actual.AuthorizationError,
  };
});

class MockSigningError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

vi.mock("@/lib/services/submissions", () => ({
  updateQuoteStatus: updateQuoteStatusMock,
  signQuoteAndPromote: signQuoteAndPromoteMock,
  SigningError: MockSigningError,
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: logAuditMock,
}));

vi.mock("@/db", () => ({
  db: {
    select: selectMock,
    insert: insertMock,
  },
}));

describe("PATCH /api/quotes/[id]/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ userId: "ops-1", tenantId: "tenant-1", roles: ["admin"] });
    requireTenantSessionMock.mockResolvedValue({ userId: "ops-1", tenantId: "tenant-1", kind: "tenant", roles: ["admin"] });
    canMock.mockReturnValue(true);
    selectMock.mockReturnValue({ from: fromMock });
    fromMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ limit: limitMock });
    limitMock.mockResolvedValue([{ id: "quote-1", tenantId: "tenant-1", automationVersionId: "ver-1", status: "draft" }]);
    insertValuesMock.mockResolvedValue(undefined);
    insertMock.mockReturnValue({ values: insertValuesMock });
  });

  it("updates automation and submission when quote is signed", async () => {
    limitMock.mockResolvedValue([{ id: "quote-1", tenantId: "tenant-1", automationVersionId: "ver-1", status: "sent" }]);
    signQuoteAndPromoteMock.mockResolvedValue({
      quote: { id: "quote-1", status: "accepted" },
      automationVersion: { id: "ver-1", status: "BuildInProgress" },
      submission: { id: "sub-1", status: "BuildInProgress", pricingStatus: "Sent" },
      previousQuoteStatus: "SENT",
      previousAutomationStatus: "NeedsPricing",
      previousSubmissionStatus: "NeedsPricing",
    });
    const { PATCH } = await import("@/app/api/quotes/[id]/status/route");

    const response = await PATCH(
      new Request("http://localhost/api/quotes/quote-1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "SIGNED" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: { id: "quote-1" } }
    );

    await response.json().catch(() => ({}));
    expect(response.status).toBe(200);
    expect(response.status).toBe(200);
    expect(signQuoteAndPromoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: "quote-1",
        tenantId: "tenant-1",
        actorRole: "tenant_admin",
      })
    );
    expect(updateQuoteStatusMock).not.toHaveBeenCalled();
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "automation.quote.accepted",
        resourceId: "quote-1",
      })
    );
  });

  it("returns 400 when quote is not sent", async () => {
    limitMock.mockResolvedValue([{ id: "quote-1", tenantId: "tenant-1", automationVersionId: "ver-1", status: "draft" }]);
    signQuoteAndPromoteMock.mockRejectedValue(new MockSigningError(400, "Quote must be SENT before signing"));
    const { PATCH } = await import("@/app/api/quotes/[id]/status/route");

    const response = await PATCH(
      new Request("http://localhost/api/quotes/quote-1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "SIGNED" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: { id: "quote-1" } }
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 when quote belongs to another tenant", async () => {
    limitMock.mockResolvedValue([]);
    const { PATCH } = await import("@/app/api/quotes/[id]/status/route");

    const response = await PATCH(
      new Request("http://localhost/api/quotes/quote-1/status", {
        method: "PATCH",
        body: JSON.stringify({ status: "SIGNED" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: { id: "quote-1" } }
    );

    expect(response.status).toBe(404);
  });
});


