"use client";

import {
  Workflow,
  Building2,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  CheckSquare,
  MessageSquare,
  Users,
  UserCog,
  Shield,
  Briefcase,
  ArrowRightLeft,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { WrkLogo } from "@/components/brand/WrkLogo";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useUserProfile } from "@/components/providers/user-profile-provider";
import { Skeleton } from "@/components/ui/skeleton";

const navItems = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { id: "automations", icon: Workflow, label: "Automations", href: "/automations" },
  { id: "tasks", icon: CheckSquare, label: "Tasks", href: "/tasks" },
  { id: "messages", icon: MessageSquare, label: "Messages", href: "/messages" },
  {
    id: "workspace-settings",
    icon: Building2,
    label: "Workspace Settings",
    href: "/workspace-settings",
  },
  { id: "team", icon: Users, label: "Team", href: "/team" },
  { id: "profile", icon: UserCog, label: "Profile", href: "/profile" },
];

const adminNavItems = [
  { id: "admin", icon: LayoutDashboard, label: "Admin Console", href: "/admin" },
  { id: "admin-clients", icon: Users, label: "Clients", href: "/admin/clients" },
  { id: "admin-projects", icon: Building2, label: "Projects", href: "/admin/projects" },
];

// Check if we're on an admin route
function isAdminRoute(pathname: string): boolean {
  return pathname.startsWith("/admin");
}

function getInitials(name?: string | null, email?: string) {
  const base = name && name.trim().length > 0 ? name : email ?? "";
  if (!base) {
    return "??";
  }
  const segments = base.split(/\s+/).filter(Boolean);
  if (segments.length === 0 && email) {
    return email.slice(0, 2).toUpperCase();
  }
  return segments
    .slice(0, 2)
    .map((segment) => segment.charAt(0).toUpperCase())
    .join("");
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: (nextCollapsed: boolean) => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const { profile, isHydrating } = useUserProfile();
  const userInitials = useMemo(() => getInitials(profile?.name, profile?.email), [profile]);
  
  const isAdmin = isAdminRoute(pathname);
  
  const handleModeSwitch = () => {
    if (isAdmin) {
      // Switch to Studio mode - go to automations page
      router.push("/automations");
    } else {
      // Switch to Admin mode - go to admin clients page
      router.push("/admin/clients");
    }
  };

  return (
    <div
      className={cn(
        "hidden md:flex flex-col bg-[#0A0A0A] h-screen text-white fixed left-0 top-0 z-50 border-r border-white/5 transition-all duration-300 ease-in-out",
        collapsed ? "w-[48px]" : "w-64"
      )}
    >
      {/* Logo Area */}
      <div
        className={cn(
          "flex items-center transition-all duration-300 relative",
          collapsed ? "px-0 py-4 justify-center" : "p-6 pb-8"
        )}
      >
        <div
          className={cn(
            "transition-transform duration-300",
            collapsed ? "origin-center scale-[0.45]" : "origin-left scale-75"
          )}
        >
          <WrkLogo />
        </div>

        {/* Expand/Collapse Button */}
        <button
          onClick={() => onToggle(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={cn(
            "absolute -right-3 top-9 bg-[#0A0A0A] border border-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all shadow-lg z-50",
            "w-6 h-6"
          )}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Mode Switcher */}
      <div className={cn("px-3 pb-2", collapsed && "px-1")}>
        <Button
          onClick={handleModeSwitch}
          variant="ghost"
          className={cn(
            "w-full justify-start gap-2 text-xs font-medium transition-all",
            collapsed
              ? "justify-center p-2 h-9"
              : "px-3 py-2 h-9",
            isAdmin
              ? "bg-red-950/30 text-red-200 hover:bg-red-950/50 hover:text-red-100 border border-red-900/30"
              : "bg-blue-950/30 text-blue-200 hover:bg-blue-950/50 hover:text-blue-100 border border-blue-900/30"
          )}
          title={collapsed ? (isAdmin ? "Switch to Studio" : "Switch to Admin") : undefined}
        >
          {isAdmin ? (
            <>
              <Shield size={14} className="shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Admin Mode</span>
                  <ArrowRightLeft size={12} className="shrink-0 opacity-50" />
                </>
              )}
            </>
          ) : (
            <>
              <Briefcase size={14} className="shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Studio Mode</span>
                  <ArrowRightLeft size={12} className="shrink-0 opacity-50" />
                </>
              )}
            </>
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 space-y-1 overflow-y-auto py-2", collapsed ? "px-1" : "px-3")}>
        {!isAdminRoute(pathname) &&
          navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={cn(
                  "flex items-center transition-all duration-200 text-sm font-medium group relative",
                  collapsed
                    ? "justify-center w-full p-2 rounded-lg"
                    : "gap-3 w-full px-3 py-2.5 rounded-lg",
                  isActive
                    ? "bg-[#E43632] text-white shadow-[0_0_15px_rgba(228,54,50,0.3)]"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                )}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  size={18}
                  className={cn(
                    "transition-colors",
                    isActive ? "text-white" : "text-gray-500 group-hover:text-white"
                  )}
                />
                {!collapsed && item.label}
                {isActive && (
                  <div
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 bg-white/20 rounded-r-full",
                      collapsed ? "left-0 w-0.5 h-4" : "left-0 w-1 h-6"
                    )}
                  />
                )}
              </Link>
            );
          })}

        {/* Admin Section */}
        {isAdmin && (
          <>
            {!collapsed && (
              <div className="my-4 mx-3">
                <p className="text-[10px] font-bold text-gray-500 uppercase mb-1 px-3">Admin</p>
              </div>
            )}
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    "flex items-center transition-all duration-200 text-sm font-medium group relative",
                    collapsed
                      ? "justify-center w-full p-2 rounded-lg"
                      : "gap-3 w-full px-3 py-2.5 rounded-lg",
                    isActive
                      ? "bg-[#E43632] text-white shadow-[0_0_15px_rgba(228,54,50,0.3)]"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon
                    size={18}
                    className={cn(
                      "transition-colors",
                      isActive ? "text-white" : "text-gray-500 group-hover:text-white"
                    )}
                  />
                  {!collapsed && item.label}
                  {isActive && (
                    <div
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 bg-white/20 rounded-r-full",
                        collapsed ? "left-0 w-0.5 h-4" : "left-0 w-1 h-6"
                      )}
                    />
                  )}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User Profile */}
      <div className={cn("mt-auto border-t border-white/10 mb-2", collapsed ? "p-1 mx-1" : "p-4 mx-2")}>
        <Link
          href="/profile"
          className={cn(
            "flex items-center group cursor-pointer rounded-lg hover:bg-white/5 transition-colors",
            collapsed ? "justify-center p-1" : "gap-3 p-2",
            pathname === "/profile" ? "bg-white/10" : ""
          )}
        >
          {profile ? (
            <Avatar className="w-8 h-8 border border-white/20 group-hover:border-white/40 transition-colors">
              {profile.avatarUrl ? <AvatarImage src={profile.avatarUrl} alt={profile.name} /> : null}
              <AvatarFallback>{userInitials}</AvatarFallback>
            </Avatar>
          ) : (
            <Skeleton className="w-8 h-8 rounded-full bg-white/10 border border-white/20" />
          )}
          {!collapsed && (
            <div className="flex-1 min-w-0 text-left">
              {profile ? (
                <>
                  <p className="text-sm font-medium text-white truncate">{profile.name}</p>
                  <p className="text-[11px] text-gray-500 truncate group-hover:text-gray-400">
                    {profile.title ?? "View profile"}
                  </p>
                </>
              ) : (
                <div className="space-y-1 py-0.5">
                  <Skeleton className="h-3 w-24 bg-white/10" />
                  <Skeleton className="h-3 w-16 bg-white/5" />
                </div>
              )}
            </div>
          )}
        </Link>
        {!collapsed && profile && !profile.avatarUrl && (
          <p className="text-[10px] text-gray-500 mt-1">Add an avatar to personalize your account.</p>
        )}
        {!collapsed && isHydrating && !profile && (
          <p className="text-[10px] text-gray-500 mt-1">Loading profile…</p>
        )}
      </div>
    </div>
  );
}
