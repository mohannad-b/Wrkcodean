import { requireWrkStaffSession } from "@/lib/api/context";
import type { ReactNode } from "react";

export default async function WrkAdminLayout({ children }: { children: ReactNode }) {
  await requireWrkStaffSession();

  return <div className="min-h-screen bg-slate-50">{children}</div>;
}

