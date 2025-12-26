 "use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, FolderKanban, LayoutGrid, Users, LogOut } from "lucide-react";
import type { WrkStaffRole } from "@/db/schema";
import { cn } from "@/components/ui/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AdminSidebarProps = {
  staffRole?: WrkStaffRole | null;
  staffName?: string | null;
  staffEmail?: string | null;
};

const baseLinks = [
  { href: "/wrk-admin/clients", label: "Clients", icon: Users },
  { href: "/wrk-admin/projects", label: "Projects", icon: FolderKanban },
];

export function AdminSidebar({ staffRole, staffName, staffEmail }: AdminSidebarProps) {
  const pathname = usePathname();
  const links =
    staffRole === "wrk_master_admin"
      ? [...baseLinks, { href: "/wrk-admin/staff", label: "Staff", icon: LayoutGrid }]
      : baseLinks;

  const displayName = staffName || staffEmail || "Staff";
  const initial = displayName.trim().charAt(0).toUpperCase();

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

      <div className="border-t border-[#1e2939] px-3 py-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[#111827] transition">
              <div className="h-10 w-10 rounded-full border border-[#364153] bg-[#111827] flex items-center justify-center text-sm font-semibold">
                {initial || "W"}
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-semibold text-white leading-none truncate">{displayName}</div>
                <div className="text-[11px] text-[#6a7282] truncate">{staffEmail ?? "Wrk staff"}</div>
              </div>
              <Bell className="h-4 w-4 text-[#6a7282]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60 bg-white border border-slate-200 shadow-lg">
            <DropdownMenuLabel className="px-3 py-2">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-semibold text-slate-900 truncate">{displayName}</p>
                <p className="text-xs text-slate-500 truncate">{staffEmail ?? "Wrk staff"}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-600" />
                <span>Profile Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                window.location.href = "/auth/logout";
              }}
              className="flex items-center gap-2 text-red-600 focus:bg-red-50 focus:text-red-700"
            >
              <LogOut className="h-4 w-4" />
              <span>Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

