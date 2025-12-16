import { z } from "zod";

export const NOTIFICATION_PREFERENCES = ["all", "mentions", "none"] as const;
export type NotificationPreference = (typeof NOTIFICATION_PREFERENCES)[number];

export interface UserProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string; // Computed from firstName/lastName for backward compatibility
  email: string;
  title: string | null;
  avatarUrl: string | null;
  timezone: string | null;
  notificationPreference: NotificationPreference;
}

export type UserProfileEditableFields = Pick<
  UserProfile,
  "firstName" | "lastName" | "title" | "avatarUrl" | "timezone" | "notificationPreference"
>;

export type UserProfileUpdatePayload = Partial<UserProfileEditableFields>;

export type UserProfileResult = {
  profile: UserProfile;
  lastUpdatedAt: string | null;
};

export const USER_PROFILE_NAME_MAX = 120;
export const USER_PROFILE_FIRST_NAME_MAX = 60;
export const USER_PROFILE_LAST_NAME_MAX = 60;
export const USER_PROFILE_TITLE_MAX = 120;

const TIMEZONE_PATTERN = /^[A-Za-z]+(?:[_-][A-Za-z]+)*(?:\/[A-Za-z]+(?:[_-][A-Za-z]+)*)+$/;
const SUPPORTED_TIMEZONES =
  typeof Intl.supportedValuesOf === "function" ? new Set(Intl.supportedValuesOf("timeZone")) : null;

const nullableLimitedString = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }
      if (value === null) {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    })
    .refine(
      (value) => value === undefined || value === null || value.length <= max,
      `Must be ${max} characters or fewer`
    );

const avatarUrlField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  .refine((value) => {
    if (value === undefined || value === null) {
      return true;
    }
    try {
      // eslint-disable-next-line no-new
      new URL(value);
      return value.length <= 2048;
    } catch {
      return false;
    }
  }, "Avatar URL must be a valid https:// link");

const timezoneField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  .refine((value) => {
    if (value === undefined || value === null) {
      return true;
    }
    if (SUPPORTED_TIMEZONES) {
      return SUPPORTED_TIMEZONES.has(value);
    }
    return TIMEZONE_PATTERN.test(value);
  }, "Timezone must be a valid IANA name (e.g. America/New_York)");

export const userProfileUpdateSchema = z
  .object({
    firstName: nullableLimitedString(USER_PROFILE_FIRST_NAME_MAX),
    lastName: nullableLimitedString(USER_PROFILE_LAST_NAME_MAX),
    title: nullableLimitedString(USER_PROFILE_TITLE_MAX),
    avatarUrl: avatarUrlField,
    timezone: timezoneField,
    notificationPreference: z.enum(NOTIFICATION_PREFERENCES).optional(),
  })
  .strict();

export type UserProfileUpdateInput = z.infer<typeof userProfileUpdateSchema>;

