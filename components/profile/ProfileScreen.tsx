"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Save } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { useUserProfile } from "@/components/providers/user-profile-provider";
import type { UserProfile } from "@/lib/user/profile-shared";
import { logger } from "@/lib/logger";
import { updateProfile, uploadAvatar } from "@/features/profile/services/profileApi";

const COMMON_TIMEZONES: readonly string[] = [
  "UTC",
  "Pacific/Midway",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Caracas",
  "America/Bogota",
  "America/Lima",
  "America/Mexico_City",
  "America/Santiago",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Brussels",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Prague",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Asia/Jerusalem",
  "Asia/Baghdad",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Kathmandu",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Taipei",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Pacific/Guam",
  "Pacific/Fiji",
];

const TIMEZONE_OPTIONS = buildTimeZoneOptions();

function buildTimeZoneOptions(): Array<{ value: string; label: string }> {
  const supportedTimezones = getSupportedTimezones();
  const combined = Array.from(new Set<string>([...COMMON_TIMEZONES, ...supportedTimezones]));

  return combined.map((timeZone) => ({
    value: timeZone,
    label: formatTimeZoneLabel(timeZone),
  }));
}

function getSupportedTimezones(): string[] {
  const intlWithSupport = Intl as typeof Intl & { supportedValuesOf?: (input: string) => string[] };
  if (typeof intlWithSupport.supportedValuesOf === "function") {
    return intlWithSupport.supportedValuesOf("timeZone");
  }
  return [...COMMON_TIMEZONES];
}

function formatTimeZoneLabel(timeZone: string): string {
  const [region, city, ...rest] = timeZone.split("/");
  const cityParts = [city, ...rest].filter(Boolean).map((part) => part.replace(/_/g, " "));
  const cityLabel = cityParts.join(" / ");
  const regionLabel = region?.replace(/_/g, " ");

  if (cityLabel && regionLabel) {
    return `${cityLabel} (${regionLabel})`;
  }
  if (cityLabel) {
    return cityLabel;
  }
  return regionLabel ?? timeZone;
}


const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_AVATAR_FILE_MB = 4;
const MAX_AVATAR_FILE_BYTES = MAX_AVATAR_FILE_MB * 1024 * 1024;

type EditableFormState = {
  firstName: string;
  lastName: string;
  title: string;
  timezone: string;
};

type EditableFieldKey = keyof EditableFormState;

function createFormState(profile: UserProfile): EditableFormState {
  return {
    firstName: profile.firstName ?? "",
    lastName: profile.lastName ?? "",
    title: profile.title ?? "",
    timezone: profile.timezone ?? "",
  };
}

function initialsFromProfile(profile: UserProfile) {
  const base = profile.name || profile.email;
  const parts = base.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((segment) => segment.charAt(0).toUpperCase())
    .join("");
}

export function ProfileScreen() {
  const { profile, setProfile, refreshProfile, isHydrating } = useUserProfile();
  const [formState, setFormState] = useState<EditableFormState | null>(profile ? createFormState(profile) : null);
  const [errors, setErrors] = useState<Partial<Record<EditableFieldKey, string>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [tempAvatarPreviewUrl, setTempAvatarPreviewUrl] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (profile) {
      setFormState(createFormState(profile));
      setErrors({});
      setTempAvatarPreviewUrl(null);
      setAvatarUploadError(null);
    }
  }, [profile]);

  const avatarPreview = useMemo(() => {
    if (!profile) {
      return { src: "", fallback: "" };
    }
    if (tempAvatarPreviewUrl) {
      return {
        src: tempAvatarPreviewUrl,
        fallback: initialsFromProfile(profile),
      };
    }
    return {
      src: profile.avatarUrl || "",
      fallback: initialsFromProfile(profile),
    };
  }, [profile, tempAvatarPreviewUrl]);

  const normalizeString = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const buildPayload = useCallback(() => {
    if (!profile || !formState) {
      return {};
    }

    const payload: Record<string, unknown> = {};
    
    const firstName = normalizeString(formState.firstName);
    if ((profile.firstName ?? null) !== firstName) {
      payload.firstName = firstName;
    }

    const lastName = normalizeString(formState.lastName);
    if ((profile.lastName ?? null) !== lastName) {
      payload.lastName = lastName;
    }

    const title = normalizeString(formState.title);
    if ((profile.title ?? null) !== title) {
      payload.title = title;
    }

    const timezone = normalizeString(formState.timezone);
    if ((profile.timezone ?? null) !== timezone) {
      payload.timezone = timezone;
    }

    return payload;
  }, [profile, formState]);

  const hasChanges = useMemo(() => Object.keys(buildPayload()).length > 0, [buildPayload]);

  const handleFieldChange = (field: EditableFieldKey, value: string) => {
    setFormState((prev) => (prev ? { ...prev, [field]: value } : prev));
    setErrors((prev) => {
      if (!(field in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleAvatarButtonClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile) {
      return;
    }

    if (!ALLOWED_AVATAR_TYPES.includes(file.type as (typeof ALLOWED_AVATAR_TYPES)[number])) {
      setAvatarUploadError("Avatar must be a PNG, JPEG, or WebP image.");
      event.target.value = "";
      return;
    }

    if (file.size === 0) {
      setAvatarUploadError("Uploaded file cannot be empty.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_AVATAR_FILE_BYTES) {
      setAvatarUploadError(`Avatar must be smaller than ${MAX_AVATAR_FILE_MB}MB.`);
      event.target.value = "";
      return;
    }

    let objectUrl: string | null = null;
    try {
      objectUrl = URL.createObjectURL(file);
      setTempAvatarPreviewUrl(objectUrl);
      setAvatarUploadError(null);
      setIsUploadingAvatar(true);

      const data = new FormData();
      data.append("file", file);

      const response = await uploadAvatar(data);

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setTempAvatarPreviewUrl(null);
        const message = body?.error ?? "Unable to upload avatar.";
        setAvatarUploadError(message);
        toast({
          title: "Avatar upload failed",
          description: message,
          variant: "error",
        });
        return;
      }

      setProfile(body.profile, body.lastUpdatedAt);
      setTempAvatarPreviewUrl(null);
      toast({
        title: "Avatar updated",
        description: "Your new avatar is live.",
        variant: "success",
      });
    } catch (error) {
    logger.error("[profile] avatar upload failed", error);
      setTempAvatarPreviewUrl(null);
      setAvatarUploadError("Unexpected error uploading avatar. Please try again.");
      toast({
        title: "Avatar upload failed",
        description: "We could not upload that file. Please try again.",
        variant: "error",
      });
    } finally {
      setIsUploadingAvatar(false);
      event.target.value = "";
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  };


  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState || !profile || !hasChanges) {
      return;
    }

    setIsSaving(true);
    setErrors({});

    const payload = buildPayload();

    try {
      const response = await updateProfile(payload);

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const fieldErrors = (data?.fieldErrors ?? {}) as Record<string, string[]>;
        if (fieldErrors) {
          const nextErrors: Partial<Record<EditableFieldKey, string>> = {};
          (Object.keys(fieldErrors) as Array<EditableFieldKey>).forEach((key) => {
            if (fieldErrors[key]?.length) {
              nextErrors[key] = fieldErrors[key][0];
            }
          });
          setErrors(nextErrors);
        }
        toast({
          title: "Unable to update profile",
          description: data?.error ?? "Please fix the highlighted fields and try again.",
          variant: "error",
        });
        return;
      }

      setProfile(data.profile, data.lastUpdatedAt);
      toast({
        title: "Profile updated",
        description: "Your changes were saved successfully.",
        variant: "success",
      });
    } catch (error) {
    logger.error("[profile] failed to save", error);
      toast({
        title: "Something went wrong",
        description: "We could not save your changes. Please try again.",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!profile || !formState) {
    return (
      <div className="max-w-4xl mx-auto p-8 md:p-12">
        <ProfileFormSkeleton />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8 md:p-12">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold text-[#0A0A0A]">Personal Information</h3>
        <Button
          type="submit"
          form="profile-form"
          className="bg-[#0A0A0A] hover:bg-gray-800 text-white"
          disabled={!hasChanges || isSaving}
        >
          <Save size={16} className="mr-2" /> {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Card className="border-gray-200 shadow-sm bg-white overflow-hidden">
        <form id="profile-form" onSubmit={handleSubmit}>
          <CardContent className="p-8 space-y-10">
            {/* Avatar Section */}
            <section className="flex flex-col sm:flex-row gap-8 items-start">
              <div className="flex-shrink-0">
                <button
                  type="button"
                  onClick={handleAvatarButtonClick}
                  className="group relative rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#E43632] transition-transform hover:scale-105"
                  title="Click to upload a new photo"
                >
                  <Avatar className="w-24 h-24 border-4 border-gray-100 shadow-lg ring-2 ring-white">
                    {avatarPreview.src ? <AvatarImage src={avatarPreview.src} alt={profile.name} /> : null}
                    <AvatarFallback className="text-2xl font-semibold bg-gradient-to-br from-[#E43632] to-[#C12E2A] text-white">
                      {avatarPreview.fallback}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white text-xs font-medium">Change</span>
                  </div>
                </button>
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="text-lg font-semibold text-[#0A0A0A] mb-1">Profile Photo</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Upload a profile picture to help your team recognize you. Supported formats: PNG, JPG, WebP (max {MAX_AVATAR_FILE_MB}MB).
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAvatarButtonClick}
                    disabled={isUploadingAvatar}
                    className="border-gray-300 hover:bg-gray-50"
                  >
                    {isUploadingAvatar ? "Uploading…" : "Change Photo"}
                  </Button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept={ALLOWED_AVATAR_TYPES.join(",")}
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                </div>
                {avatarUploadError && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {avatarUploadError}
                  </p>
                )}
              </div>
            </section>

            <Separator className="bg-gray-200" />

            {/* Form Fields */}
            <section className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-[#0A0A0A] mb-6">Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-sm font-medium text-gray-700">
                      First Name
                    </Label>
                    <Input
                      id="firstName"
                      autoComplete="given-name"
                      value={formState.firstName}
                      onChange={(event) => handleFieldChange("firstName", event.target.value)}
                      className="h-11 border-gray-300 focus:border-[#E43632] focus:ring-[#E43632]"
                      placeholder="Enter your first name"
                    />
                    {errors.firstName && (
                      <p className="text-sm text-red-600 mt-1">{errors.firstName}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-sm font-medium text-gray-700">
                      Last Name
                    </Label>
                    <Input
                      id="lastName"
                      autoComplete="family-name"
                      value={formState.lastName}
                      onChange={(event) => handleFieldChange("lastName", event.target.value)}
                      className="h-11 border-gray-300 focus:border-[#E43632] focus:ring-[#E43632]"
                      placeholder="Enter your last name"
                    />
                    {errors.lastName && (
                      <p className="text-sm text-red-600 mt-1">{errors.lastName}</p>
                    )}
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                      Email Address
                    </Label>
                    <Input
                      id="email"
                      value={profile.email}
                      readOnly
                      className="h-11 bg-gray-50 text-gray-600 border-gray-200 cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Your email is managed by your SSO provider and cannot be changed here.
                    </p>
                  </div>
                </div>
              </div>

              <Separator className="bg-gray-200" />

              <div>
                <h3 className="text-lg font-semibold text-[#0A0A0A] mb-6">Professional Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="title" className="text-sm font-medium text-gray-700">
                      Job Title
                    </Label>
                    <Input
                      id="title"
                      placeholder="e.g. Automation Lead, Product Manager"
                      value={formState.title}
                      onChange={(event) => handleFieldChange("title", event.target.value)}
                      className="h-11 border-gray-300 focus:border-[#E43632] focus:ring-[#E43632]"
                    />
                    {errors.title && (
                      <p className="text-sm text-red-600 mt-1">{errors.title}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timezone" className="text-sm font-medium text-gray-700">
                      Timezone
                    </Label>
                    <Select
                      value={formState.timezone || "__unset"}
                      onValueChange={(value) => handleFieldChange("timezone", value === "__unset" ? "" : value)}
                    >
                      <SelectTrigger id="timezone" className="h-11 border-gray-300 focus:border-[#E43632] focus:ring-[#E43632]">
                        <SelectValue placeholder="Select your timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unset">No preference</SelectItem>
                        {TIMEZONE_OPTIONS.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.timezone && (
                      <p className="text-sm text-red-600 mt-1">{errors.timezone}</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </CardContent>
        </form>
      </Card>

      {isHydrating && (
        <div className="text-sm text-gray-500 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center justify-between">
          <span>Syncing profile changes…</span>
          <Button
            type="button"
            variant="link"
            className="text-sm p-0 h-auto text-blue-600 hover:text-blue-700"
            onClick={() => refreshProfile()}
          >
            Refresh now
          </Button>
        </div>
      )}
    </div>
  );
}

function ProfileFormSkeleton() {
  return (
    <Card className="border-gray-200 shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 pb-6">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="p-8 space-y-10">
          <div className="flex flex-col sm:flex-row gap-8 items-start">
            <Skeleton className="w-24 h-24 rounded-full" />
            <div className="flex-1 space-y-3 w-full">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-full max-w-md" />
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
          <Separator />
          <div className="space-y-6">
            <Skeleton className="h-6 w-40" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-11 w-full" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50/50 px-8 py-6">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-32" />
        </CardFooter>
      </Card>
  );
}

