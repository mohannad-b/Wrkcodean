import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { UserProfileProvider } from "@/components/providers/user-profile-provider";
import { getSession } from "@/lib/auth/session";
import { getTenantScopedProfile } from "@/lib/user/profile";

interface AppShellProps {
  children: ReactNode;
}

interface AppShellClientProps extends AppShellProps {
  initialProfile: unknown;
  initialLastUpdatedAt: string | null;
}

export function AppShellClient({ children, initialProfile, initialLastUpdatedAt }: AppShellClientProps) {
  return (
    <UserProfileProvider initialProfile={initialProfile} initialLastUpdatedAt={initialLastUpdatedAt}>
      <div className="h-screen bg-[#F5F5F5] font-sans text-[#1A1A1A] flex overflow-hidden">
        <Sidebar />
        <main className="md:pl-64 flex-1 flex flex-col overflow-x-hidden overflow-y-auto">{children}</main>
      </div>
    </UserProfileProvider>
  );
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
