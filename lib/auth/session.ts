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

export class NoTenantMembershipError extends Error {
  code = "NO_TENANT_MEMBERSHIP";

  constructor(message = "No tenant membership found for current user.") {
    super(message);
    this.name = "NoTenantMembershipError";
  }
}

export type AppSession = {
  userId: string;
  tenantId: string;
  roles: string[];
};

export type UserSession = {
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

  const email = session.user.email ?? `${auth0Id.replace("|", "_")}@placeholder.local`;
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
  const { userRecord } = await getOrCreateUserFromAuth0Session();

  let membershipRows = await db
    .select({ role: memberships.role, tenantId: memberships.tenantId })
    .from(memberships)
    .where(eq(memberships.userId, userRecord.id));

  if (membershipRows.length === 0) {
    const allowBackfill = process.env.ALLOW_DEFAULT_TENANT_BACKFILL === "true";
    const fallbackTenantId = allowBackfill ? process.env.DEFAULT_TENANT_ID ?? process.env.MOCK_TENANT_ID ?? null : null;

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

    if (!fallbackTenantId || membershipRows.length === 0) {
      throw new NoTenantMembershipError();
    }
  }

  if (membershipRows.length === 0) {
    throw new NoTenantMembershipError();
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
      userId,
      tenantId: null,
      roles: [],
    };
  }

  const { userRecord } = await getOrCreateUserFromAuth0Session();
  return {
    userId: userRecord.id,
    tenantId: null,
    roles: [],
  };
}

