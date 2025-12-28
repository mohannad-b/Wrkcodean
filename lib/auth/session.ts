import { and, eq, gt, isNull, or } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import auth0 from "@/lib/auth/auth0";
import { db } from "@/db";
import {
  memberships,
  users,
  workspaceInvites,
  wrkStaffMemberships,
  type MembershipRole,
  type WrkStaffRole,
} from "@/db/schema";
import { acceptWorkspaceInvite } from "@/lib/services/workspace-members";

const ALLOWED_DEFAULT_ROLES: readonly MembershipRole[] = ["viewer", "editor", "admin", "owner", "billing"] as const;

function resolveDefaultTenantRole(): MembershipRole {
  const raw = process.env.DEFAULT_TENANT_ROLE as MembershipRole | undefined;
  if (raw && ALLOWED_DEFAULT_ROLES.includes(raw)) {
    return raw;
  }
  if (raw && !ALLOWED_DEFAULT_ROLES.includes(raw)) {
    console.warn(
      `[auth] DEFAULT_TENANT_ROLE='${raw}' is not a valid membership role. Falling back to 'client_admin'. Allowed values: ${ALLOWED_DEFAULT_ROLES.join(
        ", "
      )}.`
    );
  }
  return "viewer";
}

const DEFAULT_TENANT_ROLE = resolveDefaultTenantRole();

const withCache = <T extends (...args: any[]) => Promise<unknown>>(fn: T) => fn;

export class NoTenantMembershipError extends Error {
  code = "NO_TENANT_MEMBERSHIP";

  constructor(message = "No tenant membership found for current user.") {
    super(message);
    this.name = "NoTenantMembershipError";
  }
}

export class NoActiveWorkspaceError extends Error {
  code = "NO_ACTIVE_WORKSPACE";
  constructor(message = "No active workspace selected.") {
    super(message);
    this.name = "NoActiveWorkspaceError";
  }
}

export type TenantSession = {
  kind: "tenant";
  userId: string;
  tenantId: string;
  roles: string[];
  wrkStaffRole?: WrkStaffRole | null;
};

export type StaffSession = {
  kind: "staff";
  userId: string;
  email: string;
  name: string | null;
  wrkStaffRole: WrkStaffRole;
  tenantId: null;
  roles: [];
};

export type TenantOrStaffSession = TenantSession | StaffSession;

export type AppSession = TenantSession;

export type UserSession = {
  kind: "user";
  userId: string;
  tenantId: null;
  roles: [];
};

export type Auth0UserProfile = {
  auth0Id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

export class NotWrkStaffError extends Error {
  code = "NOT_WRK_STAFF";

  constructor(message = "User is not a member of Wrk staff.") {
    super(message);
    this.name = "NotWrkStaffError";
  }
}

function isDuplicateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  // Postgres unique_violation code 23505 or generic duplicate key text.
  return message.includes("duplicate key value") || (error as { code?: string })?.code === "23505";
}

export async function getOrCreateUserFromAuth0Session(): Promise<{
  userRecord: typeof users.$inferSelect;
  profile: Auth0UserProfile;
}> {
  const session = await auth0.getSession();

  if (!session || !session.user) {
    throw new Error("User is not authenticated.");
  }

  const auth0Id = session.user.sub;
  if (!auth0Id) {
    throw new Error("Auth0 session is missing a subject identifier.");
  }

  const emailRaw = session.user.email ?? `${auth0Id.replace("|", "_")}@placeholder.local`;
  const email = emailRaw.toLowerCase();
  const name = session.user.name ?? email;
  const avatarUrl = session.user.picture ?? null;
  
  // Split name into firstName and lastName
  let firstName: string | null = null;
  let lastName: string | null = null;
  if (name && name !== email) {
    const nameParts = name.trim().split(/\s+/);
    if (nameParts.length === 1) {
      firstName = nameParts[0];
    } else if (nameParts.length >= 2) {
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(" ");
    }
  }

  // Retry logic for database connection issues
  let userRecord;
  let retries = 3;
  let lastError: Error | null = null;
  
  while (retries > 0) {
    try {
      userRecord =
        (await db.query.users.findFirst({
          where: eq(users.auth0Id, auth0Id),
        })) ??
        (await db.query.users.findFirst({
          where: eq(users.email, email),
        }));
      break; // Success, exit retry loop
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retries--;
      if (retries > 0) {
        // Wait before retrying (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 1000 * (4 - retries)));
      }
    }
  }
  
  if (!userRecord && lastError) {
    // If we still don't have a user record and there was an error, throw it
    throw lastError;
  }

  if (userRecord && userRecord.auth0Id !== auth0Id) {
    await db
      .update(users)
      .set({
        auth0Id,
        firstName,
        lastName,
        name,
        avatarUrl,
      })
      .where(eq(users.id, userRecord.id));
    userRecord = {
      ...userRecord,
      auth0Id,
      firstName,
      lastName,
      name,
      avatarUrl,
    };
  }

  if (!userRecord) {
    // Retry logic for user creation as well
    let inserted;
    let createRetries = 3;
    let createError: Error | null = null;
    
    while (createRetries > 0) {
      try {
        [inserted] = await db
          .insert(users)
          .values({
            auth0Id,
            email,
            firstName,
            lastName,
            name,
            avatarUrl,
          })
          .returning();
        break; // Success, exit retry loop
      } catch (error) {
        createError = error instanceof Error ? error : new Error(String(error));
        // If a concurrent insert won the race, re-fetch and exit.
        if (isDuplicateError(error)) {
          inserted =
            (await db.query.users.findFirst({ where: eq(users.auth0Id, auth0Id) })) ??
            (await db.query.users.findFirst({ where: eq(users.email, email) }));
          if (inserted) break;
        }
        createRetries--;
        if (createRetries > 0) {
          // Wait before retrying (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, 1000 * (4 - createRetries)));
        }
      }
    }
    
    if (createError && !inserted) {
      throw createError;
    }

    userRecord =
      inserted ??
      (await db.query.users.findFirst({
        where: eq(users.auth0Id, auth0Id),
      }));
  }

  if (!userRecord) {
    throw new Error("Unable to persist user record for the authenticated session.");
  }

  return {
    userRecord,
    profile: {
      auth0Id,
            email,
      name,
      avatarUrl,
    },
  };
}

async function getMockSession(): Promise<AppSession> {
  const tenantId = process.env.MOCK_TENANT_ID;
  const userId = process.env.MOCK_USER_ID;

  if (!tenantId || !userId) {
    throw new Error("MOCK_TENANT_ID and MOCK_USER_ID must be set when AUTH0_MOCK_ENABLED=true.");
  }

  const membershipRows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId), eq(memberships.status, "active"))
    );

  if (membershipRows.length === 0) {
    throw new Error("Mock membership not found. Seed the database with the mock user before continuing.");
  }

  const wrkStaff = await db
    .select({ role: wrkStaffMemberships.role })
    .from(wrkStaffMemberships)
    .where(eq(wrkStaffMemberships.userId, userId))
    .limit(1);

  return {
    kind: "tenant",
    tenantId,
    userId,
    roles: membershipRows.map((row) => row.role),
    wrkStaffRole: wrkStaff[0]?.role ?? null,
  };
}

async function getWrkStaffRoleForUser(userId: string): Promise<WrkStaffRole | null> {
  const wrkStaff = await db
    .select({ role: wrkStaffMemberships.role })
    .from(wrkStaffMemberships)
    .where(eq(wrkStaffMemberships.userId, userId))
    .limit(1);

  return wrkStaff[0]?.role ?? null;
}

function getActiveWorkspaceId(): string | null {
  const headerWorkspace = headers().get("x-workspace-id");
  if (headerWorkspace) return headerWorkspace;
  const cookieStore = cookies();
  const cookieWorkspace = cookieStore.get("activeWorkspaceId")?.value;
  return cookieWorkspace ?? null;
}

export function resolveActiveTenantId(
  membershipRows: Array<{ tenantId: string }>,
  preferredTenantId: string | null
): string {
  if (membershipRows.length === 0) {
    throw new NoTenantMembershipError();
  }

  if (preferredTenantId && membershipRows.some((row) => row.tenantId === preferredTenantId)) {
    return preferredTenantId;
  }

  if (membershipRows.length === 1) {
    return membershipRows[0].tenantId;
  }

  throw new NoActiveWorkspaceError();
}

async function getAuth0BackedTenantSession(): Promise<TenantSession> {
  const { userRecord } = await getOrCreateUserFromAuth0Session();

  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "tenant-check",
      hypothesisId: "T1",
      location: "lib/auth/session.ts:getAuth0BackedTenantSession",
      message: "Resolved Auth0 session user",
      data: { userId: userRecord.id, email: userRecord.email },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  let membershipRows = await db
    .select({ role: memberships.role, tenantId: memberships.tenantId })
    .from(memberships)
    .where(and(eq(memberships.userId, userRecord.id), eq(memberships.status, "active")));

  if (membershipRows.length === 0) {
    // Auto-accept the most recent pending invite for this user (Flow 3).
    const pendingInvites = await db
      .select()
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.email, userRecord.email.toLowerCase()),
          eq(workspaceInvites.status, "pending"),
          or(isNull(workspaceInvites.expiresAt), gt(workspaceInvites.expiresAt, new Date()))
        )
      );

    if (pendingInvites.length >= 1) {
      // Choose the latest invite (by updatedAt or createdAt).
      const invite = pendingInvites.sort(
        (a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)
      )[0];
      await acceptWorkspaceInvite({
        token: invite.token,
        userId: userRecord.id,
        userEmail: userRecord.email,
      });

      membershipRows = await db
        .select({ role: memberships.role, tenantId: memberships.tenantId })
        .from(memberships)
        .where(and(eq(memberships.userId, userRecord.id), eq(memberships.status, "active")));
    }

    const allowBackfill = process.env.ALLOW_DEFAULT_TENANT_BACKFILL === "true";
    const fallbackTenantId = allowBackfill ? process.env.DEFAULT_TENANT_ID ?? process.env.MOCK_TENANT_ID ?? null : null;

    if (fallbackTenantId) {
      await db
        .insert(memberships)
        .values({
          tenantId: fallbackTenantId,
          userId: userRecord.id,
          role: DEFAULT_TENANT_ROLE,
          status: "active",
        })
        .onConflictDoNothing({
          target: [memberships.tenantId, memberships.userId],
        });

      membershipRows = await db
        .select({ role: memberships.role, tenantId: memberships.tenantId })
        .from(memberships)
        .where(eq(memberships.userId, userRecord.id));
    }

    if (!fallbackTenantId || membershipRows.length === 0) {
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "tenant-check",
          hypothesisId: "T2",
          location: "lib/auth/session.ts:getAuth0BackedTenantSession",
          message: "No membership after invites/backfill",
          data: {
            allowBackfill,
            fallbackTenantId,
            membershipCount: membershipRows.length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw new NoTenantMembershipError();
    }
  }

  if (membershipRows.length === 0) {
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "tenant-check",
        hypothesisId: "T3",
        location: "lib/auth/session.ts:getAuth0BackedTenantSession",
        message: "No membership after reload",
        data: { membershipCount: membershipRows.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw new NoTenantMembershipError();
  }

  const activeTenantId = getActiveWorkspaceId();
  const candidateTenantId = resolveActiveTenantId(membershipRows, activeTenantId);

  const roles = membershipRows
    .filter((row) => row.tenantId === candidateTenantId)
    .map((row) => row.role);

  // Check for Wrk staff membership
  const wrkStaffRole = await getWrkStaffRoleForUser(userRecord.id);

  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "tenant-check",
      hypothesisId: "T4",
      location: "lib/auth/session.ts:getAuth0BackedTenantSession",
      message: "Resolved tenant session",
      data: { tenantId: candidateTenantId, membershipCount: membershipRows.length, roles },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return {
    kind: "tenant",
    tenantId: candidateTenantId,
    userId: userRecord.id,
    roles,
    wrkStaffRole,
  };
}

export const getTenantSession = withCache(async (): Promise<AppSession> => {
  if (process.env.AUTH0_MOCK_ENABLED === "true") {
    return getMockSession();
  }

  return getAuth0BackedTenantSession();
});

export const getSession = getTenantSession;

export const getWrkStaffSession = withCache(async (): Promise<StaffSession> => {
  if (process.env.AUTH0_MOCK_ENABLED === "true") {
    const userId = process.env.MOCK_USER_ID;
    if (!userId) {
      throw new Error("MOCK_USER_ID must be set when AUTH0_MOCK_ENABLED=true.");
    }

    const role = await getWrkStaffRoleForUser(userId);
    if (!role) {
      throw new NotWrkStaffError();
    }

    return {
      kind: "staff",
      userId,
      email: process.env.MOCK_USER_EMAIL ?? "mock-staff@wrk.test",
      name: process.env.MOCK_USER_NAME ?? "Mock Wrk Staff",
      wrkStaffRole: role,
      tenantId: null,
      roles: [],
    };
  }

  const { userRecord } = await getOrCreateUserFromAuth0Session();
  const role = await getWrkStaffRoleForUser(userRecord.id);

  if (!role) {
    throw new NotWrkStaffError();
  }

  return {
    kind: "staff",
    userId: userRecord.id,
    email: userRecord.email,
    name: userRecord.name ?? userRecord.email,
    wrkStaffRole: role,
    tenantId: null,
    roles: [],
  };
});

/**
 * Get a user session without requiring tenant membership.
 * Useful for pre-workspace setup flows.
 */
export async function getUserSession(): Promise<UserSession> {
  if (process.env.AUTH0_MOCK_ENABLED === "true") {
    const userId = process.env.MOCK_USER_ID;
    if (!userId) {
      throw new Error("MOCK_USER_ID must be set when AUTH0_MOCK_ENABLED=true.");
    }
    return {
      kind: "user",
      userId,
      tenantId: null,
      roles: [],
    };
  }

  const { userRecord } = await getOrCreateUserFromAuth0Session();
  return {
    kind: "user",
    userId: userRecord.id,
    tenantId: null,
    roles: [],
  };
}

