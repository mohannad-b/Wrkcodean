import { and, eq } from "drizzle-orm";
import { cache as reactCache } from "react";
import auth0 from "@/lib/auth/auth0";
import { db } from "@/db";
import { memberships, users, type MembershipRole } from "@/db/schema";

const ALLOWED_DEFAULT_ROLES: readonly MembershipRole[] = ["client_admin", "client_member", "ops_admin", "admin"] as const;

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
  return "client_admin";
}

const DEFAULT_TENANT_ROLE = resolveDefaultTenantRole();

const withCache =
  reactCache ??
  (<T extends (...args: any[]) => Promise<AppSession>>(fn: T) => {
    return fn;
  });

export type AppSession = {
  userId: string;
  tenantId: string;
  roles: string[];
};

async function getMockSession(): Promise<AppSession> {
  const tenantId = process.env.MOCK_TENANT_ID;
  const userId = process.env.MOCK_USER_ID;

  if (!tenantId || !userId) {
    throw new Error("MOCK_TENANT_ID and MOCK_USER_ID must be set when AUTH0_MOCK_ENABLED=true.");
  }

  const membershipRows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)));

  if (membershipRows.length === 0) {
    throw new Error("Mock membership not found. Seed the database with the mock user before continuing.");
  }

  return {
    tenantId,
    userId,
    roles: membershipRows.map((row) => row.role),
  };
}

async function getAuth0BackedSession(): Promise<AppSession> {
  const session = await auth0.getSession();

  if (!session || !session.user) {
    throw new Error("User is not authenticated.");
  }

  const auth0Id = session.user.sub;
  if (!auth0Id) {
    throw new Error("Auth0 session is missing a subject identifier.");
  }

  const email = session.user.email ?? `${auth0Id.replace("|", "_")}@placeholder.local`;
  const name = session.user.name ?? email;
  const avatarUrl = session.user.picture ?? null;

  let userRecord =
    (await db.query.users.findFirst({
      where: eq(users.auth0Id, auth0Id),
    })) ??
    (await db.query.users.findFirst({
      where: eq(users.email, email),
    }));

  if (userRecord && userRecord.auth0Id !== auth0Id) {
    await db
      .update(users)
      .set({
        auth0Id,
        name,
        avatarUrl,
      })
      .where(eq(users.id, userRecord.id));
    userRecord = {
      ...userRecord,
      auth0Id,
      name,
      avatarUrl,
    };
  }

  if (!userRecord) {
    const [inserted] = await db
      .insert(users)
      .values({
        auth0Id,
        email,
        name,
        avatarUrl,
      })
      .returning();

    userRecord =
      inserted ??
      (await db.query.users.findFirst({
        where: eq(users.auth0Id, auth0Id),
      }));
  }

  if (!userRecord) {
    throw new Error("Unable to persist user record for the authenticated session.");
  }

  let membershipRows = await db
    .select({ role: memberships.role, tenantId: memberships.tenantId })
    .from(memberships)
    .where(eq(memberships.userId, userRecord.id));

  if (membershipRows.length === 0) {
    const fallbackTenantId = process.env.DEFAULT_TENANT_ID ?? process.env.MOCK_TENANT_ID ?? null;

    if (fallbackTenantId) {
      await db
        .insert(memberships)
        .values({
          tenantId: fallbackTenantId,
          userId: userRecord.id,
          role: DEFAULT_TENANT_ROLE,
        })
        .onConflictDoNothing({
          target: [memberships.tenantId, memberships.userId],
        });

      membershipRows = await db
        .select({ role: memberships.role, tenantId: memberships.tenantId })
        .from(memberships)
        .where(eq(memberships.userId, userRecord.id));
    }

    if (!fallbackTenantId) {
      throw new Error(
        "No tenant membership found for current user and DEFAULT_TENANT_ID is not configured. Set DEFAULT_TENANT_ID or seed memberships before logging in."
      );
    }
  }

  if (membershipRows.length === 0) {
    throw new Error("No tenant membership found for current user. Please ask an admin to grant access.");
  }

  const distinctTenants = new Set(membershipRows.map((row) => row.tenantId));
  if (distinctTenants.size > 1) {
    throw new Error(
      "Multiple tenant memberships detected for this user. Multi-tenant selection is not supported in v1."
    );
  }

  const primaryTenantId = membershipRows[0].tenantId;
  const roles = membershipRows
    .filter((row) => row.tenantId === primaryTenantId)
    .map((row) => row.role);

  return {
    tenantId: primaryTenantId,
    userId: userRecord.id,
    roles,
  };
}

export const getSession = withCache(async (): Promise<AppSession> => {
  if (process.env.AUTH0_MOCK_ENABLED === "true") {
    return getMockSession();
  }

  return getAuth0BackedSession();
});

