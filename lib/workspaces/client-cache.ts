"use client";

type TenantMembership = {
  tenantId: string;
  tenantName: string;
  tenantSlug?: string;
  role: string;
};

type CurrentWorkspace = {
  id: string;
  name: string;
  slug?: string | null;
  industry?: string | null;
  currency?: string | null;
  timezone?: string | null;
} | null;

let tenantsCache: TenantMembership[] | null = null;
let tenantsPromise: Promise<TenantMembership[]> | null = null;

let workspaceCache: CurrentWorkspace = null;
let workspacePromise: Promise<CurrentWorkspace> | null = null;

export async function fetchTenantMembershipsOnce(): Promise<TenantMembership[]> {
  if (tenantsCache) return tenantsCache;
  if (tenantsPromise) return tenantsPromise;

  tenantsPromise = fetch("/api/me/tenants", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load memberships");
      }
      const data = await res.json().catch(() => ({}));
      const tenants = Array.isArray(data.tenants) ? (data.tenants as TenantMembership[]) : [];
      tenantsCache = tenants;
      return tenants;
    })
    .catch((err) => {
      // Allow retries on error by clearing cache/promise
      tenantsCache = null;
      throw err;
    })
    .finally(() => {
      tenantsPromise = null;
    });

  return tenantsPromise;
}

export async function fetchCurrentWorkspaceOnce(): Promise<CurrentWorkspace> {
  if (workspaceCache) return workspaceCache;
  if (workspacePromise) return workspacePromise;

  workspacePromise = fetch("/api/workspaces", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load workspace");
      }
      const data = await res.json().catch(() => ({}));
      const tenant = data?.tenant ?? null;
      workspaceCache = tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug ?? null,
            industry: tenant.industry ?? null,
            currency: tenant.currency ?? null,
            timezone: tenant.timezone ?? null,
          }
        : null;
      return workspaceCache;
    })
    .catch((err) => {
      workspaceCache = null;
      throw err;
    })
    .finally(() => {
      workspacePromise = null;
    });

  return workspacePromise;
}

export function clearWorkspaceCache() {
  workspaceCache = null;
  workspacePromise = null;
}


