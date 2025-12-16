import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, users, type User } from "@/db/schema";
import type { AppSession } from "@/lib/auth/session";
import {
  NOTIFICATION_PREFERENCES,
  USER_PROFILE_NAME_MAX,
  USER_PROFILE_FIRST_NAME_MAX,
  USER_PROFILE_LAST_NAME_MAX,
  USER_PROFILE_TITLE_MAX,
  userProfileUpdateSchema,
  type NotificationPreference,
  type UserProfile,
  type UserProfileEditableFields,
  type UserProfileResult,
  type UserProfileUpdateInput,
  type UserProfileUpdatePayload,
} from "./profile-shared";

export function mapUserToProfile(user: User): UserProfile {
  // Compute name from firstName/lastName if available, otherwise fall back to name field or email
  let computedName: string;
  if (user.firstName || user.lastName) {
    const parts = [user.firstName, user.lastName].filter(Boolean);
    computedName = parts.length > 0 ? parts.join(" ") : user.email;
  } else {
    computedName = user.name?.trim() && user.name.trim().length > 0 ? user.name.trim() : user.email;
  }

  return {
    id: user.id,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    name: computedName,
    email: user.email,
    title: user.title ?? null,
    avatarUrl: user.avatarUrl ?? null,
    timezone: user.timezone ?? null,
    notificationPreference: (user.notificationPreference as NotificationPreference) ?? "all",
  };
}

export async function getTenantScopedUser(session: AppSession): Promise<User | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
  });

  if (!user) {
    return null;
  }

  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.userId, session.userId), eq(memberships.tenantId, session.tenantId)),
  });

  if (!membership) {
    return null;
  }

  return user;
}

export async function getTenantScopedProfile(session: AppSession): Promise<UserProfileResult | null> {
  const user = await getTenantScopedUser(session);
  if (!user) {
    return null;
  }

  return {
    profile: mapUserToProfile(user),
    lastUpdatedAt: user.updatedAt?.toISOString() ?? null,
  };
}

export function buildProfileUpdate(data: UserProfileUpdateInput): UserProfileUpdatePayload {
  const payload: UserProfileUpdatePayload = {};

  if (data.firstName !== undefined) {
    payload.firstName = data.firstName;
  }
  if (data.lastName !== undefined) {
    payload.lastName = data.lastName;
  }
  if (data.title !== undefined) {
    payload.title = data.title;
  }
  if (data.avatarUrl !== undefined) {
    payload.avatarUrl = data.avatarUrl;
  }
  if (data.timezone !== undefined) {
    payload.timezone = data.timezone;
  }
  if (data.notificationPreference !== undefined) {
    payload.notificationPreference = data.notificationPreference;
  }

  return payload;
}

export async function updateUserProfile(
  session: AppSession,
  updates: UserProfileUpdatePayload
): Promise<UserProfileResult | null> {
  const user = await getTenantScopedUser(session);
  if (!user) {
    return null;
  }

  if (Object.keys(updates).length === 0) {
    return {
      profile: mapUserToProfile(user),
      lastUpdatedAt: user.updatedAt?.toISOString() ?? null,
    };
  }

  // Compute name from firstName/lastName if either is being updated
  const updatePayload: Record<string, unknown> = { ...updates };
  if (updates.firstName !== undefined || updates.lastName !== undefined) {
    const finalFirstName = updates.firstName !== undefined ? updates.firstName : user.firstName;
    const finalLastName = updates.lastName !== undefined ? updates.lastName : user.lastName;
    const parts = [finalFirstName, finalLastName].filter(Boolean);
    updatePayload.name = parts.length > 0 ? parts.join(" ") : user.email;
  }

  const [updated] = await db
    .update(users)
    .set({
      ...updatePayload,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();

  const nextUser = updated ?? user;

  return {
    profile: mapUserToProfile(nextUser),
    lastUpdatedAt: nextUser.updatedAt?.toISOString() ?? null,
  };
}

export {
  NOTIFICATION_PREFERENCES,
  USER_PROFILE_NAME_MAX,
  USER_PROFILE_FIRST_NAME_MAX,
  USER_PROFILE_LAST_NAME_MAX,
  USER_PROFILE_TITLE_MAX,
  userProfileUpdateSchema,
};

export type {
  NotificationPreference,
  UserProfile,
  UserProfileEditableFields,
  UserProfileResult,
  UserProfileUpdatePayload,
};

