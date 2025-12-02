"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { useUserProfile } from "@/components/providers/user-profile-provider";
import { NOTIFICATION_PREFERENCES, type UserProfile } from "@/lib/user/profile-shared";
import { cn } from "@/lib/utils";

const TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "Eastern (US & Canada)" },
  { value: "America/Chicago", label: "Central (US & Canada)" },
  { value: "America/Denver", label: "Mountain (US & Canada)" },
  { value: "America/Los_Angeles", label: "Pacific (US & Canada)" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Berlin", label: "Berlin" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Tokyo" },
] as const;

const NOTIFICATION_LABELS: Record<(typeof NOTIFICATION_PREFERENCES)[number], string> = {
  all: "All activity",
  mentions: "Mentions & assignments",
  none: "Mute everything",
};

const ALLOWED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_AVATAR_FILE_MB = 4;
const MAX_AVATAR_FILE_BYTES = MAX_AVATAR_FILE_MB * 1024 * 1024;

type EditableFormState = {
  name: string;
  title: string;
  avatarUrl: string;
  timezone: string;
  notificationPreference: (typeof NOTIFICATION_PREFERENCES)[number];
};

type EditableFieldKey = keyof EditableFormState;

function createFormState(profile: UserProfile): EditableFormState {
  return {
    name: profile.name,
    title: profile.title ?? "",
    avatarUrl: profile.avatarUrl ?? "",
    timezone: profile.timezone ?? "",
    notificationPreference: profile.notificationPreference,
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
  const { profile, lastUpdatedAt, setProfile, refreshProfile, isHydrating } = useUserProfile();
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
      src: formState?.avatarUrl?.trim() || profile.avatarUrl || "",
      fallback: initialsFromProfile(profile),
    };
  }, [profile, formState?.avatarUrl, tempAvatarPreviewUrl]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) {
      return null;
    }
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(lastUpdatedAt));
    } catch {
      return null;
    }
  }, [lastUpdatedAt]);

  const normalizeString = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const buildPayload = useCallback(() => {
    if (!profile || !formState) {
      return {};
    }

    const payload: Record<string, unknown> = {};
    const name = formState.name.trim();
    if (name && name !== profile.name) {
      payload.name = name;
    }

    const title = normalizeString(formState.title);
    if ((profile.title ?? null) !== title) {
      payload.title = title;
    }

    const avatarUrl = normalizeString(formState.avatarUrl);
    if ((profile.avatarUrl ?? null) !== avatarUrl) {
      payload.avatarUrl = avatarUrl;
    }

    const timezone = normalizeString(formState.timezone);
    if ((profile.timezone ?? null) !== timezone) {
      payload.timezone = timezone;
    }

    if (profile.notificationPreference !== formState.notificationPreference) {
      payload.notificationPreference = formState.notificationPreference;
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

      const response = await fetch("/api/me/avatar", {
        method: "POST",
        body: data,
      });

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
      setFormState((prev) => (prev ? { ...prev, avatarUrl: body.profile.avatarUrl ?? "" } : prev));
      setTempAvatarPreviewUrl(null);
      toast({
        title: "Avatar updated",
        description: "Your new avatar is live.",
      });
    } catch (error) {
      console.error("[profile] avatar upload failed", error);
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
      const response = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

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
      });
    } catch (error) {
      console.error("[profile] failed to save", error);
      toast({
        title: "Something went wrong",
        description: "We could not save your changes. Please try again.",
        variant: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (profile) {
      setFormState(createFormState(profile));
      setErrors({});
    }
  };

  if (!profile || !formState) {
    return (
      <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-6">
        <ProfileFormSkeleton />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-6">
      <div className="space-y-2">
        <p className="text-sm text-gray-500 uppercase tracking-wide font-semibold">Account</p>
        <h1 className="text-3xl font-bold text-[#0A0A0A]">Profile</h1>
        <p className="text-sm text-gray-500">
          Update how your teammates see you across WRK. Email comes from your SSO provider and cannot be edited
          here.
        </p>
        {lastUpdatedLabel && (
          <p className="text-xs text-gray-400">
            Last updated <span className="font-medium text-gray-500">{lastUpdatedLabel}</span>
          </p>
        )}
      </div>

      <Card className="border-gray-200 shadow-sm bg-white">
        <CardHeader className="border-b border-gray-100">
          <div>
            <CardTitle className="text-xl font-semibold">Personal details</CardTitle>
            <CardDescription>Control how your name, avatar, and notifications appear.</CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-8 py-6">
            <section className="flex flex-col gap-6 md:flex-row md:items-center">
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16 border border-gray-200">
                  {avatarPreview.src ? <AvatarImage src={avatarPreview.src} alt={profile.name} /> : null}
                  <AvatarFallback>{avatarPreview.fallback}</AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-900">Profile photo</p>
                  <p className="text-xs text-gray-500">PNG, JPG, or WebP up to {MAX_AVATAR_FILE_MB}MB.</p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleAvatarButtonClick}
                      disabled={isUploadingAvatar}
                    >
                      {isUploadingAvatar ? "Uploading…" : "Change avatar"}
                    </Button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept={ALLOWED_AVATAR_TYPES.join(",")}
                      className="hidden"
                      onChange={handleAvatarFileChange}
                    />
                  </div>
                  {avatarUploadError ? <p className="text-xs text-red-500">{avatarUploadError}</p> : null}
                </div>
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="avatarUrl">Avatar URL</Label>
                <Input
                  id="avatarUrl"
                  placeholder="https://..."
                  value={formState.avatarUrl}
                  onChange={(event) => handleFieldChange("avatarUrl", event.target.value)}
                />
                {errors.avatarUrl ? <p className="text-xs text-red-500">{errors.avatarUrl}</p> : null}
                <p className="text-xs text-gray-400">
                  Uploaded images automatically populate this field. You can still paste a public URL if preferred.
                </p>
              </div>
            </section>

            <Separator />

            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  autoComplete="name"
                  value={formState.name}
                  onChange={(event) => handleFieldChange("name", event.target.value)}
                />
                {errors.name ? <p className="text-xs text-red-500">{errors.name}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={profile.email} readOnly className="bg-gray-50 text-gray-500" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="e.g. Automation Lead"
                  value={formState.title}
                  onChange={(event) => handleFieldChange("title", event.target.value)}
                />
                {errors.title ? <p className="text-xs text-red-500">{errors.title}</p> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select
                  value={formState.timezone || "__unset"}
                  onValueChange={(value) => handleFieldChange("timezone", value === "__unset" ? "" : value)}
                >
                  <SelectTrigger id="timezone">
                    <SelectValue placeholder="Choose timezone" />
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
                {errors.timezone ? <p className="text-xs text-red-500">{errors.timezone}</p> : null}
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                <p className="text-xs text-gray-500">Choose when we should send alerts or summaries.</p>
              </div>
              <RadioGroup
                value={formState.notificationPreference}
                onValueChange={(value) => handleFieldChange("notificationPreference", value)}
                className="grid gap-3 sm:grid-cols-3"
              >
                {NOTIFICATION_PREFERENCES.map((option) => (
                  <label
                    key={option}
                    className="border border-gray-200 rounded-lg p-3 flex flex-col gap-1 text-left cursor-pointer hover:border-gray-300 data-[state=checked]:border-[#E43632] data-[state=checked]:bg-[#E43632]/5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">{NOTIFICATION_LABELS[option]}</span>
                      <RadioGroupItem value={option} id={`notif-${option}`} className="sr-only" />
                      <div className="w-4 h-4 rounded-full border border-gray-300 flex items-center justify-center">
                        <div
                          className={cn(
                            "w-2.5 h-2.5 rounded-full",
                            formState.notificationPreference === option ? "bg-[#E43632]" : "bg-transparent"
                          )}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      {option === "all"
                        ? "Includes approvals, mentions, reminders."
                        : option === "mentions"
                          ? "Only when you are tagged or assigned."
                          : "Mute everything except billing & security."}
                    </p>
                  </label>
                ))}
              </RadioGroup>
              {errors.notificationPreference ? (
                <p className="text-xs text-red-500">{errors.notificationPreference}</p>
              ) : null}
            </section>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 border-t border-gray-100 md:flex-row md:items-center md:justify-between">
            <div className="text-xs text-gray-500">
              Need to update your email? Contact your identity provider administrator.
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Button type="button" variant="ghost" disabled={!hasChanges || isSaving} onClick={handleReset}>
                Reset
              </Button>
              <Button
                type="submit"
                className="bg-[#E43632] hover:bg-[#C12E2A] text-white"
                disabled={!hasChanges || isSaving}
              >
                {isSaving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>

      {isHydrating && (
        <div className="text-xs text-gray-400">
          Syncing profile changes…{" "}
          <Button type="button" variant="link" className="text-xs p-0" onClick={() => refreshProfile()}>
            Refresh now
          </Button>
        </div>
      )}
    </div>
  );
}

function ProfileFormSkeleton() {
  return (
    <Card className="border-gray-200 shadow-sm bg-white">
      <CardHeader className="border-b border-gray-100 space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-6 py-6">
        <div className="flex items-center gap-4">
          <Skeleton className="w-16 h-16 rounded-full" />
          <div className="space-y-2 w-full">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        <Separator />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <div className="grid sm:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-3 border-t border-gray-100">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-32" />
      </CardFooter>
    </Card>
  );
}

