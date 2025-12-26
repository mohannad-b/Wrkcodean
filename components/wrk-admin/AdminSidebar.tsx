 "use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, ShieldCheck } from "lucide-react";
import { cn } from "@/components/ui/utils";

const links = [
  { href: "/wrk-admin/clients", label: "Clients", icon: Users },
  { href: "/wrk-admin/projects", label: "Submissions", icon: LayoutGrid },
  { href: "/wrk-admin/staff", label: "Staff", icon: ShieldCheck },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-slate-950 text-white w-64 min-h-screen flex flex-col">
      <div className="h-16 border-b border-slate-800 flex items-center px-6">
        <div className="bg-red-500 text-white font-semibold rounded-md w-8 h-8 flex items-center justify-center mr-2">
          W
        </div>
        <div className="font-semibold text-lg leading-none">WRK Ops</div>
      </div>
      <nav className="flex-1 py-4">
        <ul className="space-y-1">
          {links.map((link) => {
            const active = pathname?.startsWith(link.href);
            const Icon = link.icon;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cn(
                    "mx-3 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-slate-800 text-white" : "text-slate-200 hover:bg-slate-800/70"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="border-t border-slate-800 px-4 py-4 text-xs text-slate-400">
        Platform Control Plane
      </div>
    </aside>
  );
}

