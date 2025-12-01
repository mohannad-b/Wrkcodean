import { describe, it, expect } from "vitest";
import { can, type RbacSubject } from "@/lib/auth/rbac";

const baseUser = (overrides: Partial<RbacSubject> = {}): RbacSubject => ({
  userId: "user-1",
  tenantId: "tenant-1",
  roles: [],
  ...overrides,
});

describe("can()", () => {
  it("allows client_admins to create and update automations in their tenant", () => {
    const user = baseUser({ roles: ["client_admin"] });

    expect(can(user, "automation:create", { type: "automation", tenantId: "tenant-1" })).toBe(true);
    expect(can(user, "automation:update", { type: "automation_version", tenantId: "tenant-1" })).toBe(true);
  });

  it("allows members to read but not update automations", () => {
    const member = baseUser({ roles: ["member"] });

    expect(can(member, "automation:read", { type: "automation", tenantId: "tenant-1" })).toBe(true);
    expect(can(member, "automation:update", { type: "automation", tenantId: "tenant-1" })).toBe(false);
    expect(can(member, "automation:metadata:update", { type: "automation_version", tenantId: "tenant-1" })).toBe(true);
  });

  it("grants ops_admins access to admin projects and quotes", () => {
    const opsAdmin = baseUser({ roles: ["ops_admin"] });

    expect(can(opsAdmin, "admin:project:read")).toBe(true);
    expect(can(opsAdmin, "admin:quote:update")).toBe(true);
  });

  it("blocks cross-tenant automation access regardless of role", () => {
    const admin = baseUser({ roles: ["admin"] });

    expect(can(admin, "automation:update", { type: "automation", tenantId: "tenant-2" })).toBe(false);
  });
});


