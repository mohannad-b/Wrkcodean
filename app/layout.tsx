import type { Metadata } from "next";
import { Auth0Provider } from "@auth0/nextjs-auth0/client";
import { AppShell } from "@/components/layout/AppShell";
import { getSession } from "@/lib/auth/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "WRK Copilot",
  description: "Manage your automated workflows and automations",
};

async function ensureUserProvisioned() {
  try {
    await getSession();
  } catch (error) {
    if (error instanceof Error && error.message.includes("not authenticated")) {
      return;
    }
    throw error;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await ensureUserProvisioned();

  return (
    <html lang="en">
      <body>
        <Auth0Provider>
          <AppShell>{children}</AppShell>
        </Auth0Provider>
      </body>
    </html>
  );
}




