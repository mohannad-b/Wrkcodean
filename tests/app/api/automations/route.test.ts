import { describe, it, expect, beforeEach, vi } from "vitest";

const getSessionMock = vi.fn();
const canMock = vi.fn();
const returningMock = vi.fn();
const valuesMock = vi.fn(() => ({
  returning: returningMock,
}));
const insertMock = vi.fn(() => ({
  values: valuesMock,
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@/lib/auth/rbac", () => ({
  can: canMock,
}));

vi.mock("@/db", () => ({
  db: {
    insert: insertMock,
  },
}));

describe("POST /api/automations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the tenant id from the session and ignores request tenant hints", async () => {
    const session = { userId: "user-1", tenantId: "tenant-session", roles: ["client_admin"] };
    getSessionMock.mockResolvedValue(session);
    canMock.mockReturnValue(true);
    returningMock.mockResolvedValue([
      { id: "auto-1", tenantId: "tenant-session", name: "Example", description: null },
    ]);

    const { POST } = await import("@/app/api/automations/route");
    const request = new Request("http://localhost/api/automations", {
      method: "POST",
      body: JSON.stringify({ name: "Example", tenantId: "tenant-evil" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.automation.tenantId).toBe("tenant-session");
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-session",
        createdBy: "user-1",
      })
    );
  });

  it("fails when the session is missing a tenant id", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "", roles: ["client_admin"] });
    const { POST } = await import("@/app/api/automations/route");

    const request = new Request("http://localhost/api/automations", {
      method: "POST",
      body: JSON.stringify({ name: "Example" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(canMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 401 when no session is available", async () => {
    getSessionMock.mockRejectedValue(new Error("no session"));
    const { POST } = await import("@/app/api/automations/route");

    const request = new Request("http://localhost/api/automations", {
      method: "POST",
      body: JSON.stringify({ name: "Example" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});


