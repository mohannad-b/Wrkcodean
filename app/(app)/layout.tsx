import type { Metadata } from "next";
import { Auth0Provider } from "@auth0/nextjs-auth0/client";
import { AppShell } from "@/components/layout/AppShell";
import { Toaster } from "@/components/ui/sonner";
import { ensureUserProvisioned } from "./ensureUserProvisioned";

export const metadata: Metadata = {
  title: "WRK Copilot",
  description: "Manage your automated workflows and automations",
};

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
