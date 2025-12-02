import { describe, it, expect, beforeEach, vi } from "vitest";

const getSessionMock = vi.fn();
const canMock = vi.fn();
const updateQuoteStatusMock = vi.fn();
const signQuoteAndPromoteMock = vi.fn();
const logAuditMock = vi.fn();

const limitMock = vi.fn();
const whereMock = vi.fn(() => ({ limit: limitMock }));
const fromMock = vi.fn(() => ({ where: whereMock }));
const selectMock = vi.fn(() => ({ from: fromMock }));
const insertValuesMock = vi.fn().mockResolvedValue(undefined);
const insertMock = vi.fn(() => ({ values: insertValuesMock }));

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@/lib/auth/rbac", () => ({
  can: canMock,
}));

vi.mock("@/lib/services/projects", () => ({
  updateQuoteStatus: updateQuoteStatusMock,
  signQuoteAndPromote: signQuoteAndPromoteMock,
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
    vi.resetModules();
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ userId: "ops-1", tenantId: "tenant-1", roles: ["ops_admin"] });
    canMock.mockReturnValue(true);
    selectMock.mockReturnValue({ from: fromMock });
    fromMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ limit: limitMock });
    limitMock.mockResolvedValue([{ id: "quote-1", tenantId: "tenant-1", automationVersionId: "ver-1", status: "draft" }]);
    insertValuesMock.mockResolvedValue(undefined);
    insertMock.mockReturnValue({ values: insertValuesMock });
  });

  it("updates automation and project when quote is signed", async () => {
    limitMock.mockResolvedValue([{ id: "quote-1", tenantId: "tenant-1", automationVersionId: "ver-1", status: "sent" }]);
    signQuoteAndPromoteMock.mockResolvedValue({
      quote: { id: "quote-1", status: "accepted" },
      automationVersion: { id: "ver-1", status: "BuildInProgress" },
      project: { id: "proj-1", status: "BuildInProgress" },
      previousQuoteStatus: "SENT",
      previousAutomationStatus: "NeedsPricing",
      previousProjectStatus: "NeedsPricing",
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

    expect(response.status).toBe(200);
    expect(response.status).toBe(200);
    expect(signQuoteAndPromoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        quoteId: "quote-1",
        tenantId: "tenant-1",
      })
    );
    expect(updateQuoteStatusMock).not.toHaveBeenCalled();
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "quote_signed",
        resourceId: "quote-1",
      })
    );
  });

  it("returns 400 when quote is not sent", async () => {
    limitMock.mockResolvedValue([{ id: "quote-1", tenantId: "tenant-1", automationVersionId: "ver-1", status: "draft" }]);
    signQuoteAndPromoteMock.mockRejectedValue(new Error("Quote must be SENT before signing"));
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


