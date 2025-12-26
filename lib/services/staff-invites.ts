import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  memberships,
  staffInvites,
  tenants,
  users,
  wrkStaffMemberships,
  type WrkStaffRole,
} from "@/db/schema";
import { ApiError } from "@/lib/api/context";
import { EmailService } from "@/lib/email/service";
import { logAudit } from "@/lib/audit/log";
import { setStaffRole } from "@/lib/services/platform-admin";

const INVITE_TTL_DAYS = 7;
const WRK_TECH_TENANT_ID = process.env.WRK_TECH_TENANT_ID;
const PLATFORM_TENANT_FALLBACK =
  WRK_TECH_TENANT_ID ?? process.env.PLATFORM_TENANT_ID ?? "00000000-0000-0000-0000-000000000000";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function generateToken() {
  return randomBytes(24).toString("hex");
}

function futureDate(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function createStaffInvite(params: { email: string; role: WrkStaffRole; invitedBy: string }) {
  const email = normalizeEmail(params.email);
  const nextToken = generateToken();
  const timestamp = new Date();
  const expiresAt = futureDate(INVITE_TTL_DAYS);

  const existing = await db.query.staffInvites.findFirst({
    where: and(eq(staffInvites.email, email), eq(staffInvites.status, "pending")),
  });

  const values = {
    email,
    role: params.role,
    token: nextToken,
    status: "pending" as const,
    invitedBy: params.invitedBy,
    expiresAt,
    updatedAt: timestamp,
  };

  const [invite] = existing
    ? await db
        .update(staffInvites)
        .set(values)
        .where(eq(staffInvites.id, existing.id))
        .returning()
    : await db
        .insert(staffInvites)
        .values({ ...values, createdAt: timestamp })
        .returning();

  if (!invite) {
    throw new ApiError(500, "Failed to create invite");
  }

  const appBaseUrl =
    process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:3000";
  const baseUrl = appBaseUrl.replace(/\/$/, "");
  const inviteLink = `${baseUrl}/invite/staff/accept?token=${invite.token}`;

  const inviter = await db.query.users.findFirst({ where: eq(users.id, params.invitedBy) });
  const inviterName =
    `${inviter?.firstName ?? ""} ${inviter?.lastName ?? ""}`.trim() || inviter?.name || inviter?.email || "A teammate";

  const platformName =
    (await db.query.tenants.findFirst({ where: eq(tenants.slug, "wrk-technologies") }))?.name ??
    "Wrk Platform";

  await EmailService.sendTransactional({
    templateId: "transactional.user-invite",
    idempotencyKey: `staff-invite:${invite.id}`,
    to: email,
    variables: {
      inviterName,
      workspaceName: platformName,
      inviteeEmail: email,
      inviteLink,
      unsubscribeLink: `${baseUrl}/unsubscribe`,
      privacyLink: `${baseUrl}/privacy`,
      helpLink: `${baseUrl}/help`,
      physicalAddress: process.env.EMAIL_PHYSICAL_ADDRESS ?? "1250 Rene-Levesque West, Montreal, Quebec, Canada",
      year: new Date().getFullYear().toString(),
    },
  });

  await logAudit({
    tenantId: PLATFORM_TENANT_FALLBACK,
    userId: params.invitedBy,
    action: "platform.staff.invited",
    resourceType: "staff_invite",
    resourceId: invite.id,
    metadata: { email, role: params.role },
  });

  return invite;
}

export async function acceptStaffInvite(params: { token: string; userId: string; userEmail: string }) {
  const invite = await db.query.staffInvites.findFirst({
    where: and(eq(staffInvites.token, params.token), eq(staffInvites.status, "pending")),
  });

  if (!invite) {
    throw new ApiError(404, "Invite not found or already processed.");
  }

  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    throw new ApiError(410, "Invite has expired.");
  }

  if (normalizeEmail(invite.email) !== normalizeEmail(params.userEmail)) {
    throw new ApiError(403, "Invite email does not match your account.");
  }

  await setStaffRole({ userId: params.userId, role: invite.role, actorUserId: params.userId });

  await db
    .update(staffInvites)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(eq(staffInvites.id, invite.id));

  // Optional: add to shared WRK tenant for context (does not gate staff access).
  if (WRK_TECH_TENANT_ID) {
    try {
      await db
        .insert(memberships)
        .values({
          tenantId: WRK_TECH_TENANT_ID,
          userId: params.userId,
          role: "admin",
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing({ target: [memberships.tenantId, memberships.userId] });
    } catch (error) {
      // Non-fatal: platform access should not depend on this membership.
      console.warn("[staff-invite] Failed to add user to WRK tenant:", error);
    }
  }

  await logAudit({
    tenantId: PLATFORM_TENANT_FALLBACK,
    userId: params.userId,
    action: "platform.staff.accepted_invite",
    resourceType: "staff_invite",
    resourceId: invite.id,
    metadata: { email: invite.email, role: invite.role },
  });

  return { role: invite.role };
}

