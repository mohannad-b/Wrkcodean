import { describe, it, expect } from "vitest";
import { can, type RbacSubject } from "@/lib/auth/rbac";

const baseUser = (overrides: Partial<RbacSubject> = {}): RbacSubject => ({
  userId: "user-1",
  tenantId: "tenant-1",
  roles: [],
  ...overrides,
});

describe("can()", () => {
  it("allows owners to create and update automations in their tenant", () => {
    const user = baseUser({ roles: ["owner"] });

    expect(can(user, "automation:create", { type: "automation", tenantId: "tenant-1" })).toBe(true);
    expect(can(user, "automation:update", { type: "automation_version", tenantId: "tenant-1" })).toBe(true);
    expect(can(user, "automation:deploy", { type: "automation_version", tenantId: "tenant-1" })).toBe(true);
  });

  it("allows editors to write but not deploy", () => {
    const member = baseUser({ roles: ["editor"] });

    expect(can(member, "automation:read", { type: "automation", tenantId: "tenant-1" })).toBe(true);
    expect(can(member, "automation:update", { type: "automation", tenantId: "tenant-1" })).toBe(true);
    expect(can(member, "automation:deploy", { type: "automation_version", tenantId: "tenant-1" })).toBe(false);
  });

  it("grants admins access to admin actions", () => {
    const admin = baseUser({ roles: ["admin"] });

    expect(can(admin, "admin:project:read")).toBe(true);
    expect(can(admin, "admin:quote:update")).toBe(true);
  });

  it("blocks cross-tenant automation access regardless of role", () => {
    const admin = baseUser({ roles: ["admin"] });

    expect(can(admin, "automation:update", { type: "automation", tenantId: "tenant-2" })).toBe(false);
  });

  it("restricts billing role to billing endpoints", () => {
    const billing = baseUser({ roles: ["billing"] });
    expect(can(billing, "billing:view", { type: "workspace", tenantId: "tenant-1" })).toBe(true);
    expect(can(billing, "automation:read", { type: "automation", tenantId: "tenant-1" })).toBe(false);
  });
});


