import { describe, it, expect } from "vitest";
import { authorize, can, AuthorizationError } from "@/lib/auth/rbac";
import type { TenantSession, StaffSession } from "@/lib/auth/session";

const tenantEditor: TenantSession = {
  kind: "tenant",
  tenantId: "t1",
  userId: "u1",
  roles: ["editor"],
  wrkStaffRole: null,
};

const tenantViewer: TenantSession = {
  kind: "tenant",
  tenantId: "t1",
  userId: "u2",
  roles: ["viewer"],
  wrkStaffRole: null,
};

const staffViewer: StaffSession = {
  kind: "staff",
  tenantId: null,
  userId: "s1",
  email: "s1@wrk.com",
  name: "Staff Viewer",
  wrkStaffRole: "wrk_viewer",
  roles: [],
};

const staffOperator: StaffSession = {
  kind: "staff",
  tenantId: null,
  userId: "s2",
  email: "s2@wrk.com",
  name: "Staff Operator",
  wrkStaffRole: "wrk_operator",
  roles: [],
};

const staffSuperAdmin: StaffSession = {
  kind: "staff",
  tenantId: null,
  userId: "s3",
  email: "s3@wrk.com",
  name: "Super Admin",
  wrkStaffRole: "wrk_master_admin",
  roles: [],
};

describe("authorize / can", () => {
  it("allows tenant editor to write workflow chat within tenant", () => {
    const ctx = { type: "workflow", tenantId: "t1", workflowId: "w1" } as const;
    expect(() => authorize("workflow:chat:write", ctx, tenantEditor)).not.toThrow();
    expect(can(tenantEditor, "workflow:chat:write", ctx)).toBe(true);
  });

  it("denies tenant viewer from writing workflow chat", () => {
    const ctx = { type: "workflow", tenantId: "t1", workflowId: "w1" } as const;
    expect(() => authorize("workflow:chat:write", ctx, tenantViewer)).toThrow(AuthorizationError);
    expect(can(tenantViewer, "workflow:chat:write", ctx)).toBe(false);
  });

  it("allows staff operator to write workflow chat via platform mapping", () => {
    const ctx = { type: "workflow", tenantId: "t1", workflowId: "w1" } as const;
    expect(() => authorize("workflow:chat:write", ctx, staffOperator)).not.toThrow();
  });

  it("denies staff viewer from writing workflow chat", () => {
    const ctx = { type: "workflow", tenantId: "t1", workflowId: "w1" } as const;
    expect(() => authorize("workflow:chat:write", ctx, staffViewer)).toThrow(AuthorizationError);
  });

  it("only superadmin can impersonate", () => {
    expect(() => authorize("platform:wrk_staff:write", { type: "platform" }, staffSuperAdmin)).not.toThrow();
    expect(() => authorize("platform:wrk_staff:write", { type: "platform" }, staffOperator)).toThrow(AuthorizationError);
  });

  it("requires tenantId for tenant actions", () => {
    expect(() => authorize("automation:read", { type: "automation" } as any, tenantEditor)).toThrow(AuthorizationError);
  });
});

