import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Auth0Provider } from "@auth0/nextjs-auth0/client";
import { AppShell } from "@/components/layout/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { NoTenantMembershipError, getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "WRK Copilot",
  description: "Manage your automated workflows and automations",
};

async function ensureUserProvisioned() {
  try {
    await getSession();
  } catch (error) {
    if (error instanceof Error && error.message.includes("not authenticated")) {
      redirect("/auth/login");
    }
    if (error instanceof NoTenantMembershipError) {
      // User is authenticated but has no tenant yet; allow workspace-setup flow to proceed.
      return;
    }
    throw error;
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await ensureUserProvisioned();

  return (
    <Auth0Provider>
      <AppShell>{children}</AppShell>
      <Toaster position="top-center" richColors closeButton />
    </Auth0Provider>
  );
}
