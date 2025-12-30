import { describe, it, expect, beforeEach, vi } from "vitest";

const requireTenantSessionMock = vi.fn();
const canMock = vi.fn();
const priceAndCreateMock = vi.fn();

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

vi.mock("@/lib/services/pricing", () => ({
  priceAndCreateQuoteForVersion: priceAndCreateMock,
}));

describe("POST /api/automation-versions/[id]/price-and-quote with discount code", () => {
  const params = { params: { id: "v1" } };

  beforeEach(() => {
    vi.resetAllMocks();
    requireTenantSessionMock.mockResolvedValue({ tenantId: "t1", userId: "u1", roles: ["admin"], kind: "tenant" });
    canMock.mockReturnValue(true);
    priceAndCreateMock.mockResolvedValue({
      quoteId: "q1",
      submissionId: "p1",
      automationVersionId: "v1",
      pricing: {},
    });
  });

  it("passes discountCode through to pricing service", async () => {
    const { POST } = await import("@/app/api/automation-versions/[id]/price-and-quote/route");
    const res = await POST(
      new Request("http://localhost/api/automation-versions/v1/price-and-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complexity: "basic",
          estimatedActions: [],
          estimatedVolume: 1000,
          discounts: [],
          discountCode: "FIRST-ABC",
        }),
      }),
      params
    );
    expect(res.status).toBe(201);
    expect(priceAndCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        discountCode: "FIRST-ABC",
        actorRole: "tenant_admin",
      })
    );
  });
});

