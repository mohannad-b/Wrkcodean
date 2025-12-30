import { describe, it, expect, vi, beforeEach } from "vitest";

const requireTenantSessionMock = vi.fn();
const canMock = vi.fn();
const signQuoteAndPromoteMock = vi.fn();
const logAuditMock = vi.fn();
const verifyTokenMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve(selectMock())) })) }));

vi.mock("@/lib/api/context", () => ({
  requireTenantSession: requireTenantSessionMock,
  handleApiError: (error: unknown) =>
    new Response((error as Error).message, { status: (error as { status?: number }).status ?? 500 }),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/auth/rbac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/rbac")>("@/lib/auth/rbac");
  return {
    ...actual,
    can: canMock,
  };
});

vi.mock("@/lib/services/submissions", () => ({
  signQuoteAndPromote: signQuoteAndPromoteMock,
  SigningError: class SigningError extends Error {
    code: string;
    status: number;
    constructor(code: string, status: number) {
      super(code);
      this.code = code;
      this.status = status;
    }
  },
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: logAuditMock,
}));

vi.mock("@/lib/auth/signing-token", () => ({
  verifySigningToken: verifyTokenMock,
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: fromMock }),
  },
}));

vi.mock("@/db/schema", () => ({
  quotes: {},
}));

describe("PATCH /api/quotes/[id]/status signing token", () => {
  const params = { params: { id: "q1" } };

  beforeEach(() => {
    vi.resetAllMocks();
    canMock.mockReturnValue(true);
    signQuoteAndPromoteMock.mockResolvedValue({
      quote: { id: "q1", status: "accepted", signedAt: new Date().toISOString() },
      automationVersion: null,
      submission: null,
      previousQuoteStatus: "SENT",
    });
    selectMock.mockReturnValue([{ id: "q1", tenantId: "t1", status: "sent" }]);
  });

  it("allows signing with a valid signing token when session is absent", async () => {
    requireTenantSessionMock.mockResolvedValue({ tenantId: "t1", userId: "u1", roles: ["admin"], kind: "tenant" });
    verifyTokenMock.mockReturnValue({ tenantId: "t1", quoteId: "q1", issuedAt: Date.now(), expiresAt: Date.now() + 10000 });

    const { PATCH } = await import("@/app/api/quotes/[id]/status/route");
    const res = await PATCH(
      new Request("http://localhost/api/quotes/q1/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer abc" },
        body: JSON.stringify({ status: "SIGNED" }),
      }),
      params
    );
    expect(res.status).toBe(200);
    expect(signQuoteAndPromoteMock).toHaveBeenCalledWith(expect.objectContaining({ actorRole: "tenant_admin" }));
  });
});

