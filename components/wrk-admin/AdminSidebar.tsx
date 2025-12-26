 "use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, FolderKanban, LayoutGrid, Users } from "lucide-react";
import { cn } from "@/components/ui/utils";

const links = [
  { href: "/wrk-admin/clients", label: "Clients", icon: Users },
  { href: "/wrk-admin/projects", label: "Projects", icon: FolderKanban },
  { href: "/wrk-admin/staff", label: "Staff", icon: LayoutGrid },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-[#0a0a0a] text-white w-64 min-h-screen flex flex-col">
      <div className="h-16 border-b border-[#1e2939] flex items-center px-6">
        <div className="bg-[#e43632] text-white font-semibold rounded-md w-8 h-8 flex items-center justify-center mr-2">
          W
        </div>
        <div className="font-semibold text-lg leading-none">WRK Ops</div>
      </div>

      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-2">
          {links.map((link) => {
            const active = pathname?.startsWith(link.href);
            const Icon = link.icon;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-[#1e2939] text-white" : "text-[#99a1af] hover:bg-[#111827]"
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

      <div className="border-t border-[#1e2939] px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full border border-[#364153] bg-[#111827] flex items-center justify-center text-sm font-semibold">
            S
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-white leading-none">Sarah Connor</div>
            <div className="text-[11px] text-[#6a7282]">Head of Ops</div>
          </div>
          <Bell className="h-4 w-4 text-[#6a7282]" />
        </div>
      </div>
    </aside>
  );
}

