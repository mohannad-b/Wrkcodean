import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  tenants,
  users,
  wrkStaffMemberships,
  type WrkStaffRole,
  memberships,
  workspaceInvites,
  type MembershipRole,
} from "@/db/schema";
import { logAudit } from "@/lib/audit/log";
import { updateMemberRole } from "@/lib/services/workspace-members";
import { cancelWorkspaceInvite, resendWorkspaceInvite } from "@/lib/services/workspace-members";

const PLATFORM_TENANT_ID = "00000000-0000-0000-0000-000000000000";

export async function listStaffUsers() {
  const rows = await db
    .select({
      userId: wrkStaffMemberships.userId,
      role: wrkStaffMemberships.role,
      email: users.email,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      createdAt: wrkStaffMemberships.createdAt,
      updatedAt: wrkStaffMemberships.updatedAt,
    })
    .from(wrkStaffMemberships)
    .innerJoin(users, eq(users.id, wrkStaffMemberships.userId))
    .orderBy(wrkStaffMemberships.createdAt);

  return rows;
}

export async function setStaffRole(params: { userId: string; role: WrkStaffRole; actorUserId: string }) {
  const timestamp = new Date();
  const [existing] = await db
    .select({ id: wrkStaffMemberships.id, role: wrkStaffMemberships.role })
    .from(wrkStaffMemberships)
    .where(eq(wrkStaffMemberships.userId, params.userId));

  const [record] = await db
    .insert(wrkStaffMemberships)
    .values({
      userId: params.userId,
      role: params.role,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: wrkStaffMemberships.userId,
      set: { role: params.role, updatedAt: timestamp },
    })
    .returning();

  await logAudit({
    tenantId: PLATFORM_TENANT_ID,
    userId: params.actorUserId,
    action: "platform.wrk_staff.role_set",
    resourceType: "wrk_staff_membership",
    resourceId: record.id,
    metadata: { from: existing?.role, to: params.role, userId: params.userId },
  });

  return record;
}

export async function revokeStaffAccess(params: { userId: string; actorUserId: string }) {
  const [deleted] = await db
    .delete(wrkStaffMemberships)
    .where(eq(wrkStaffMemberships.userId, params.userId))
    .returning();

  await logAudit({
    tenantId: PLATFORM_TENANT_ID,
    userId: params.actorUserId,
    action: "platform.wrk_staff.revoked",
    resourceType: "wrk_staff_membership",
    resourceId: params.userId,
    metadata: { deleted: Boolean(deleted) },
  });

  return deleted;
}

export async function suspendWorkspace(params: { tenantId: string; actorUserId: string; reason?: string }) {
  const [record] = await db
    .update(tenants)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(eq(tenants.id, params.tenantId))
    .returning();

  await logAudit({
    tenantId: params.tenantId,
    userId: params.actorUserId,
    action: "platform.workspace.suspended",
    resourceType: "workspace",
    resourceId: params.tenantId,
    metadata: { reason: params.reason },
  });

  return record;
}

export async function restoreWorkspace(params: { tenantId: string; actorUserId: string }) {
  const [record] = await db
    .update(tenants)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(tenants.id, params.tenantId))
    .returning();

  await logAudit({
    tenantId: params.tenantId,
    userId: params.actorUserId,
    action: "platform.workspace.restored",
    resourceType: "workspace",
    resourceId: params.tenantId,
  });

  return record;
}

export async function suspendUser(params: { userId: string; actorUserId: string; reason?: string }) {
  const [record] = await db
    .update(users)
    .set({ status: "suspended", updatedAt: new Date() })
    .where(eq(users.id, params.userId))
    .returning();

  await logAudit({
    tenantId: PLATFORM_TENANT_ID,
    userId: params.actorUserId,
    action: "platform.user.suspended",
    resourceType: "user",
    resourceId: params.userId,
    metadata: { reason: params.reason },
  });

  return record;
}

export async function restoreUser(params: { userId: string; actorUserId: string }) {
  const [record] = await db
    .update(users)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(users.id, params.userId))
    .returning();

  await logAudit({
    tenantId: PLATFORM_TENANT_ID,
    userId: params.actorUserId,
    action: "platform.user.restored",
    resourceType: "user",
    resourceId: params.userId,
  });

  return record;
}

export async function changeMembershipRoleById(params: {
  membershipId: string;
  nextRole: MembershipRole;
  actorUserId: string;
}) {
  const membership = await db.query.memberships.findFirst({
    where: eq(memberships.id, params.membershipId),
    columns: { id: true, tenantId: true },
  });

  if (!membership) {
    return null;
  }

  const updated = await updateMemberRole({
    tenantId: membership.tenantId,
    membershipId: params.membershipId,
    actorUserId: params.actorUserId,
    actorRoles: ["owner"], // platform actions bypass tenant role constraints
    nextRole: params.nextRole,
  });

  return updated;
}

export async function resendInviteById(params: { inviteId: string; actorUserId: string }) {
  const invite = await db.query.workspaceInvites.findFirst({
    where: eq(workspaceInvites.id, params.inviteId),
    columns: { id: true, tenantId: true },
  });

  if (!invite) return null;

  return resendWorkspaceInvite({ tenantId: invite.tenantId, inviteId: params.inviteId, actorUserId: params.actorUserId });
}

export async function cancelInviteById(params: { inviteId: string; actorUserId: string }) {
  const invite = await db.query.workspaceInvites.findFirst({
    where: eq(workspaceInvites.id, params.inviteId),
    columns: { id: true, tenantId: true },
  });

  if (!invite) return null;

  return cancelWorkspaceInvite({ tenantId: invite.tenantId, inviteId: params.inviteId, actorUserId: params.actorUserId });
}

