import { requireWrkStaffSession } from "@/lib/api/context";
import type { ReactNode } from "react";
import { AdminSidebar } from "@/components/wrk-admin/AdminSidebar";

export default async function WrkAdminLayout({ children }: { children: ReactNode }) {
  await requireWrkStaffSession();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <AdminSidebar />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

