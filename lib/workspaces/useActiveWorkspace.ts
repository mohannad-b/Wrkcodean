"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchTenantMembershipsOnce } from "@/lib/workspaces/client-cache";

type Membership = {
  tenantId: string;
  tenantName: string;
  tenantSlug?: string;
  role: string;
};

type ActiveWorkspaceState = {
  activeWorkspace: Membership | null;
  memberships: Membership[];
  isLoading: boolean;
  error: string | null;
  setActiveWorkspace: (workspaceId: string) => Promise<void>;
};

export function useActiveWorkspace(): ActiveWorkspaceState {
  const router = useRouter();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const membersJson = await fetchTenantMembershipsOnce();
        if (cancelled) return;
        setMemberships(membersJson ?? []);
        const cookieMatch = document.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("activeWorkspaceId="));
        const cookieId = cookieMatch ? decodeURIComponent(cookieMatch.split("=")[1]) : null;
        setActiveId(cookieId);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Failed to load workspace context");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeWorkspace = useMemo(() => memberships.find((m) => m.tenantId === activeId) ?? null, [memberships, activeId]);

  const setActiveWorkspace = async (workspaceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/active-workspace", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to set workspace");
      }
      setActiveId(workspaceId);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed to switch workspace");
    } finally {
      setLoading(false);
    }
  };

  return { activeWorkspace, memberships, isLoading, error, setActiveWorkspace };
}

