import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth/auth0", () => ({
  default: {
    getSession: vi.fn(),
    middleware: vi.fn(),
  },
}));

import { resolveActiveTenantId, NoActiveWorkspaceError, NoTenantMembershipError } from "@/lib/auth/session";

describe("resolveActiveTenantId", () => {
  it("chooses preferred when valid", () => {
    const tenantId = resolveActiveTenantId(
      [
        { tenantId: "t1" },
        { tenantId: "t2" },
      ],
      "t2"
    );
    expect(tenantId).toBe("t2");
  });

  it("chooses sole membership automatically", () => {
    const tenantId = resolveActiveTenantId([{ tenantId: "t1" }], null);
    expect(tenantId).toBe("t1");
  });

  it("throws when multiple memberships and no preference", () => {
    expect(() =>
      resolveActiveTenantId(
        [
          { tenantId: "t1" },
          { tenantId: "t2" },
        ],
        null
      )
    ).toThrow(NoActiveWorkspaceError);
  });

  it("throws when no memberships", () => {
    expect(() => resolveActiveTenantId([], null)).toThrow(NoTenantMembershipError);
  });
});

