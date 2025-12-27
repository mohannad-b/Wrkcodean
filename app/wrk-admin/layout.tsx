import { requireWrkStaffSession } from "@/lib/api/context";
import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/wrk-admin/AdminSidebar";
import { UserProfileProvider } from "@/components/providers/user-profile-provider";

export default async function WrkAdminLayout({ children }: { children: ReactNode }) {
  const session = await requireWrkStaffSession();

  return (
    <UserProfileProvider initialProfile={null}>
      <div className="min-h-screen bg-slate-50 flex">
        <AdminSidebar staffRole={session.wrkStaffRole} staffName={session.name} staffEmail={session.email} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </UserProfileProvider>
  );
}

