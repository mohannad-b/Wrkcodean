import { ReactNode } from "react";
import { AppShellClient } from "./AppShellClient";
import { getSession } from "@/lib/auth/session";
import { getTenantScopedProfile } from "@/lib/user/profile";

interface AppShellProps {
  children: ReactNode;
}

export async function AppShell({ children }: AppShellProps) {
  let initialProfile = null;
  let initialLastUpdatedAt: string | null = null;

  try {
    const session = await getSession();
    const profileResult = await getTenantScopedProfile(session);
    if (profileResult) {
      initialProfile = profileResult.profile;
      initialLastUpdatedAt = profileResult.lastUpdatedAt;
    }
  } catch (error) {
    console.warn("[AppShell] Unable to load initial profile", error);
  }

  return <AppShellClient initialProfile={initialProfile} initialLastUpdatedAt={initialLastUpdatedAt}>{children}</AppShellClient>;
}
