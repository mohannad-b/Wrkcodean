"use client";

import { ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { UserProfileProvider } from "@/components/providers/user-profile-provider";
import { UserProfile } from "@/lib/user/profile-shared";
import { cn } from "@/lib/utils";

interface AppShellClientProps {
  children: ReactNode;
  initialProfile: UserProfile | null;
  initialLastUpdatedAt: string | null;
}

export function AppShellClient({ children, initialProfile, initialLastUpdatedAt }: AppShellClientProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const contentPaddingClass = sidebarCollapsed ? "md:pl-12" : "md:pl-64";

  return (
    <UserProfileProvider initialProfile={initialProfile} initialLastUpdatedAt={initialLastUpdatedAt}>
      <div className="h-screen bg-[#F5F5F5] font-sans text-[#1A1A1A] flex overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} onToggle={setSidebarCollapsed} />
        <main className={cn("flex-1 flex flex-col overflow-x-hidden overflow-y-auto transition-all duration-300", contentPaddingClass)}>
          {children}
        </main>
      </div>
    </UserProfileProvider>
  );
}

