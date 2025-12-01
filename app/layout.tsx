import type { Metadata } from "next";
import { Auth0Provider } from "@auth0/nextjs-auth0/client";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "WRK Copilot",
  description: "Manage your automated workflows and automations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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




