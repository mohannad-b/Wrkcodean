import { randomBytes } from "crypto";
import { and, count, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import {
  automations,
  memberships,
  tenants,
  users,
  workspaceInvites,
  type MembershipRole,
  type WorkspaceInvite,
} from "@/db/schema";
import { logAudit } from "@/lib/audit/log";
import { ApiError } from "@/lib/api/context";
import { EmailService } from "@/lib/email/service";

type MembershipRow = typeof memberships.$inferSelect;

export type MemberSummary = {
  membershipId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipRow["status"];
  firstName: string | null;
  lastName: string | null;
  name: string;
  email: string;
  avatarUrl: string | null;
  title: string | null;
  automationsCount: number;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InviteSummary = {
  id: string;
  tenantId: string;
  email: string;
  role: MembershipRole;
  status: WorkspaceInvite["status"];
  token: string;
  invitedBy: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
};

const INVITE_TTL_DAYS = 7;
const ROLE_PRIORITY: MembershipRole[] = ["owner", "admin", "editor", "viewer", "billing"];
const ROLE_ALIASES: Record<string, MembershipRole> = {
  client_admin: "owner",
  client_member: "viewer",
  ops_admin: "admin",
  member: "viewer",
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function futureDate(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function generateToken() {
  return randomBytes(24).toString("hex");
}

function resolvePrimaryRoleInternal(roles: string[]): MembershipRole {
  const normalized = roles
    .map((role) => ROLE_ALIASES[role] ?? role)
    .map((role) => role.toLowerCase()) as MembershipRole[];
  const found = ROLE_PRIORITY.find((role) => normalized.includes(role));
  return found ?? "viewer";
}

function buildWhere<T>(conditions: (T | undefined)[]) {
  const filtered = conditions.filter(Boolean) as T[];
  if (filtered.length === 1) return filtered[0];
  // @ts-expect-error drizzle and() expects variadic args
  return and(...filtered);
}

async function countActiveOwners(tenantId: string, excludeMembershipId?: string) {
  const where = buildWhere([
    eq(memberships.tenantId, tenantId),
    eq(memberships.role, "owner"),
    eq(memberships.status, "active"),
    excludeMembershipId ? ne(memberships.id, excludeMembershipId) : undefined,
  ]);

  const [{ total }] = await db
    .select({ total: count() })
    .from(memberships)
    .where(where);

  return Number(total ?? 0);
}

export function resolvePrimaryRole(roles: string[]): MembershipRole {
  return resolvePrimaryRoleInternal(roles);
}

export async function listWorkspaceMembers(tenantId: string): Promise<MemberSummary[]> {
  const automationCounts = db.$with("automation_counts").as(
    db
      .select({
        userId: automations.createdBy,
        total: count().as("total"),
      })
      .from(automations)
      .where(eq(automations.tenantId, tenantId))
      .groupBy(automations.createdBy)
  );

  const rows = await db
    .with(automationCounts)
    .select({
      membershipId: memberships.id,
      userId: memberships.userId,
      role: memberships.role,
      status: memberships.status,
      firstName: users.firstName,
      lastName: users.lastName,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      title: users.title,
      automationsCount: automationCounts.total,
      lastActiveAt: users.updatedAt,
      createdAt: memberships.createdAt,
      updatedAt: memberships.updatedAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(automationCounts, eq(automationCounts.userId, users.id))
    .where(eq(memberships.tenantId, tenantId));

  return rows.map((row) => ({
    ...row,
    name: row.name ?? row.email ?? "Unknown",
    automationsCount: Number(row.automationsCount ?? 0),
    lastActiveAt: row.lastActiveAt ? row.lastActiveAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function listWorkspaceInvites(tenantId: string): Promise<InviteSummary[]> {
  const rows = await db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.tenantId, tenantId));

  return rows.map((invite) => ({
    id: invite.id,
    tenantId: invite.tenantId,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    token: invite.token,
    invitedBy: invite.invitedBy,
    createdAt: invite.createdAt.toISOString(),
    updatedAt: invite.updatedAt.toISOString(),
    expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
  }));
}

async function findMembershipById(membershipId: string, tenantId: string) {
  return db.query.memberships.findFirst({
    where: and(eq(memberships.id, membershipId), eq(memberships.tenantId, tenantId)),
  });
}

async function findMembershipByUser(tenantId: string, userId: string) {
  return db.query.memberships.findFirst({
    where: and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)),
  });
}

async function getUserByEmail(email: string) {
  return db.query.users.findFirst({
    where: eq(users.email, normalizeEmail(email)),
  });
}

export async function createWorkspaceInvite(params: {
  tenantId: string;
  email: string;
  role: MembershipRole;
  invitedBy: string;
}) {
  const email = normalizeEmail(params.email);

  if (params.role === "owner") {
    throw new ApiError(400, "Use ownership transfer to assign an Owner.");
  }

  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    const existingMembership = await db.query.memberships.findFirst({
      where: and(
        eq(memberships.tenantId, params.tenantId),
        eq(memberships.userId, existingUser.id),
        eq(memberships.status, "active")
      ),
    });
    if (existingMembership) {
      throw new ApiError(409, "User is already a member of this workspace.");
    }
  }

  const pendingInvite = await db.query.workspaceInvites.findFirst({
    where: and(
      eq(workspaceInvites.tenantId, params.tenantId),
      eq(workspaceInvites.email, email),
      eq(workspaceInvites.status, "pending")
    ),
  });

  const nextExpiresAt = futureDate(INVITE_TTL_DAYS);
  const nextToken = generateToken();
  const timestamp = new Date();

  const inviteValues = {
    tenantId: params.tenantId,
    email,
    role: params.role,
    token: nextToken,
    status: "pending" as const,
    invitedBy: params.invitedBy,
    expiresAt: nextExpiresAt,
    updatedAt: timestamp,
  };

  let invite: WorkspaceInvite | undefined;

  if (pendingInvite) {
    [invite] = await db
      .update(workspaceInvites)
      .set(inviteValues)
      .where(eq(workspaceInvites.id, pendingInvite.id))
      .returning();
  } else {
    [invite] = await db
      .insert(workspaceInvites)
      .values({
        ...inviteValues,
        createdAt: timestamp,
      })
      .returning();
  }

  if (!invite) {
    throw new ApiError(500, "Failed to persist invite");
  }

  const workspace = await db.query.tenants.findFirst({
    where: eq(tenants.id, params.tenantId),
  });

  const appBaseUrl =
    process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:3000";
  const baseUrl = appBaseUrl.replace(/\/$/, "");
  const inviteLink = `${baseUrl}/invite/accept?token=${invite.token}`;

  const inviter = await db.query.users.findFirst({
    where: eq(users.id, params.invitedBy),
  });

  const recipientFirstName = invite.email.split("@")[0] || "there";
  const inviterName =
    `${inviter?.firstName ?? ""} ${inviter?.lastName ?? ""}`.trim() || inviter?.name || inviter?.email || "A teammate";

  await EmailService.sendTransactional({
    templateId: "transactional.user-invite",
    idempotencyKey: `workspace-invite:${invite.id}`,
    to: invite.email,
    variables: {
      inviterName,
      workspaceName: workspace?.name ?? "your workspace",
      inviteeEmail: invite.email,
      inviteLink,
      unsubscribeLink: `${baseUrl}/unsubscribe`,
      privacyLink: `${baseUrl}/privacy`,
      helpLink: `${baseUrl}/help`,
      physicalAddress:
        process.env.EMAIL_PHYSICAL_ADDRESS ?? "1250 Rene-Levesque West, Montreal, Quebec, Canada",
      year: new Date().getFullYear().toString(),
    },
  });

  await logAudit({
    tenantId: params.tenantId,
    userId: params.invitedBy,
    action: "workspace.invited",
    resourceType: "workspace_invite",
    resourceId: invite.id,
    metadata: { email, role: params.role },
  });

  return invite;
}

export async function cancelWorkspaceInvite(params: { tenantId: string; inviteId: string; actorUserId: string }) {
  const [invite] = await db
    .update(workspaceInvites)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(workspaceInvites.id, params.inviteId), eq(workspaceInvites.tenantId, params.tenantId)))
    .returning();

  if (!invite) {
    throw new ApiError(404, "Invite not found");
  }

  await logAudit({
    tenantId: params.tenantId,
    userId: params.actorUserId,
    action: "workspace.invite.cancelled",
    resourceType: "workspace_invite",
    resourceId: invite.id,
    metadata: { email: invite.email },
  });

  return invite;
}

export async function resendWorkspaceInvite(params: { tenantId: string; inviteId: string; actorUserId: string }) {
  const timestamp = new Date();
  const [invite] = await db
    .update(workspaceInvites)
    .set({
      status: "pending",
      token: generateToken(),
      expiresAt: futureDate(INVITE_TTL_DAYS),
      updatedAt: timestamp,
    })
    .where(and(eq(workspaceInvites.id, params.inviteId), eq(workspaceInvites.tenantId, params.tenantId)))
    .returning();

  if (!invite) {
    throw new ApiError(404, "Invite not found");
  }

  await logAudit({
    tenantId: params.tenantId,
    userId: params.actorUserId,
    action: "workspace.invite.resent",
    resourceType: "workspace_invite",
    resourceId: invite.id,
    metadata: { email: invite.email },
  });

  return invite;
}

export async function acceptWorkspaceInvite(params: { token: string; userId: string; userEmail: string }) {
  const invite = await db.query.workspaceInvites.findFirst({
    where: and(eq(workspaceInvites.token, params.token), eq(workspaceInvites.status, "pending")),
  });

  if (!invite) {
    throw new ApiError(404, "Invite not found or already processed.");
  }

  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    throw new ApiError(410, "Invite has expired.");
  }

  const normalizedEmail = normalizeEmail(params.userEmail);
  if (normalizeEmail(invite.email) !== normalizedEmail) {
    throw new ApiError(403, "Invite email does not match your account.");
  }

  const existingMembership = await findMembershipByUser(invite.tenantId, params.userId);
  const timestamp = new Date();

  let membership: MembershipRow | undefined;
  if (existingMembership) {
    [membership] = await db
      .update(memberships)
      .set({ role: invite.role, status: "active", updatedAt: timestamp })
      .where(eq(memberships.id, existingMembership.id))
      .returning();
  } else {
    [membership] = await db
      .insert(memberships)
      .values({
        tenantId: invite.tenantId,
        userId: params.userId,
        role: invite.role,
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing({
        target: [memberships.tenantId, memberships.userId],
      })
      .returning();

    // If a race inserted the membership, fetch it.
    if (!membership) {
      membership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.tenantId, invite.tenantId),
          eq(memberships.userId, params.userId)
        ),
      });
    }
  }

  await db
    .update(workspaceInvites)
    .set({ status: "accepted", updatedAt: timestamp })
    .where(eq(workspaceInvites.id, invite.id));

  await logAudit({
    tenantId: invite.tenantId,
    userId: params.userId,
    action: "workspace.invite.accepted",
    resourceType: "workspace_member",
    resourceId: membership?.id ?? params.userId,
    metadata: { email: invite.email, role: invite.role },
  });

  return { invite, membership };
}

export async function updateMemberRole(params: {
  tenantId: string;
  membershipId: string;
  actorUserId: string;
  actorRoles: string[];
  nextRole: MembershipRole;
}) {
  const membership = await findMembershipById(params.membershipId, params.tenantId);
  if (!membership) {
    throw new ApiError(404, "Member not found");
  }

  if (membership.status !== "active") {
    throw new ApiError(400, "Cannot change role for inactive member");
  }

  const actorIsOwner = params.actorRoles.includes("owner");
  if (params.nextRole === "owner" && !actorIsOwner) {
    throw new ApiError(403, "Only the Owner can promote another member to Owner.");
  }

  if (membership.role === "owner" && !actorIsOwner) {
    throw new ApiError(403, "Admins cannot change the Owner role.");
  }

  if (membership.role === "owner" && params.nextRole !== "owner") {
    const owners = await countActiveOwners(params.tenantId, membership.id);
    if (owners === 0) {
      throw new ApiError(400, "Cannot remove the last Owner. Transfer ownership first.");
    }
  }

  const [updated] = await db
    .update(memberships)
    .set({ role: params.nextRole, status: "active", updatedAt: new Date() })
    .where(eq(memberships.id, membership.id))
    .returning();

  await logAudit({
    tenantId: params.tenantId,
    userId: params.actorUserId,
    action: "workspace.member.role_changed",
    resourceType: "workspace_member",
    resourceId: membership.id,
    metadata: { from: membership.role, to: params.nextRole },
  });

  return updated;
}

export async function removeMember(params: {
  tenantId: string;
  membershipId: string;
  actorUserId: string;
  actorRoles: string[];
}) {
  const membership = await findMembershipById(params.membershipId, params.tenantId);
  if (!membership) {
    throw new ApiError(404, "Member not found");
  }

  const actorIsOwner = params.actorRoles.includes("owner");

  if (membership.role === "owner" && !actorIsOwner) {
    throw new ApiError(403, "Admins cannot remove the Owner.");
  }

  if (membership.role === "owner") {
    const owners = await countActiveOwners(params.tenantId, membership.id);
    if (owners === 0) {
      throw new ApiError(400, "Cannot remove the last Owner. Transfer ownership first.");
    }
  }

  if (membership.userId === params.actorUserId && membership.role === "owner") {
    throw new ApiError(400, "Owners must transfer ownership before leaving.");
  }

  const [updated] = await db
    .update(memberships)
    .set({ status: "removed", updatedAt: new Date() })
    .where(eq(memberships.id, membership.id))
    .returning();

  await logAudit({
    tenantId: params.tenantId,
    userId: params.actorUserId,
    action: "workspace.member.removed",
    resourceType: "workspace_member",
    resourceId: membership.id,
    metadata: { removedUserId: membership.userId, role: membership.role },
  });

  return updated;
}

export async function transferOwnership(params: {
  tenantId: string;
  targetMembershipId: string;
  actorUserId: string;
}) {
  const targetMembership = await findMembershipById(params.targetMembershipId, params.tenantId);
  if (!targetMembership) {
    throw new ApiError(404, "Target member not found");
  }

  if (targetMembership.status !== "active") {
    throw new ApiError(400, "Target member is not active");
  }

  if (targetMembership.role === "owner") {
    throw new ApiError(400, "Target member is already the Owner.");
  }

  const actorMembership = await findMembershipByUser(params.tenantId, params.actorUserId);
  if (!actorMembership || actorMembership.role !== "owner" || actorMembership.status !== "active") {
    throw new ApiError(403, "Only the current Owner can transfer ownership.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(memberships)
      .set({ role: "owner", status: "active", updatedAt: new Date() })
      .where(eq(memberships.id, targetMembership.id));

    await tx
      .update(memberships)
      .set({ role: "admin", status: "active", updatedAt: new Date() })
      .where(eq(memberships.id, actorMembership.id));
  });

  await logAudit({
    tenantId: params.tenantId,
    userId: params.actorUserId,
    action: "workspace.ownership.transferred",
    resourceType: "workspace_member",
    resourceId: targetMembership.id,
    metadata: { previousOwner: actorMembership.userId, newOwner: targetMembership.userId },
  });

  return { newOwnerId: targetMembership.userId, previousOwnerId: actorMembership.userId };
}


