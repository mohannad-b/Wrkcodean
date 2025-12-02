"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import type { UserProfile } from "@/lib/user/profile";

type UserProfileContextValue = {
  profile: UserProfile | null;
  lastUpdatedAt: string | null;
  setProfile: (profile: UserProfile, lastUpdatedAt?: string | null) => void;
  refreshProfile: () => Promise<UserProfile | null>;
  isHydrating: boolean;
};

const UserProfileContext = createContext<UserProfileContextValue | undefined>(undefined);

type ProviderProps = {
  initialProfile: UserProfile | null;
  initialLastUpdatedAt?: string | null;
  children: ReactNode;
};

export function UserProfileProvider({ initialProfile, initialLastUpdatedAt = null, children }: ProviderProps) {
  const [profile, setProfileState] = useState<UserProfile | null>(initialProfile);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(initialLastUpdatedAt);
  const [isHydrating, setIsHydrating] = useState<boolean>(!initialProfile);

  const setProfile = useCallback((next: UserProfile, updatedAt?: string | null) => {
    setProfileState(next);
    if (updatedAt !== undefined) {
      setLastUpdatedAt(updatedAt ?? null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      setIsHydrating(true);
      const response = await fetch("/api/me/profile", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load profile");
      }
      const data = (await response.json()) as { profile: UserProfile; lastUpdatedAt: string | null };
      setProfile(data.profile, data.lastUpdatedAt);
      return data.profile;
    } catch (error) {
      console.error("[profile] failed to refresh profile", error);
      return null;
    } finally {
      setIsHydrating(false);
    }
  }, [setProfile]);

  useEffect(() => {
    if (!profile) {
      refreshProfile().catch(() => null);
    } else if (isHydrating) {
      setIsHydrating(false);
    }
  }, [profile, refreshProfile, isHydrating]);

  const value = useMemo<UserProfileContextValue>(
    () => ({
      profile,
      lastUpdatedAt,
      setProfile,
      refreshProfile,
      isHydrating,
    }),
    [profile, lastUpdatedAt, setProfile, refreshProfile, isHydrating]
  );

  return <UserProfileContext.Provider value={value}>{children}</UserProfileContext.Provider>;
}

export function useUserProfile() {
  const context = useContext(UserProfileContext);
  if (!context) {
    throw new Error("useUserProfile must be used within a UserProfileProvider");
  }
  return context;
}

