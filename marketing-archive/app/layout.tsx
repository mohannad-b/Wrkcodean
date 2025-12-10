import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "WRK Copilot | AI-built automation with human reliability",
  description:
    "Describe your process, let AI draft the automation, and pay only for successful outcomes with WRK Copilot.",
  metadataBase: new URL("https://www.wrkcopilot.com"),
  openGraph: {
    title: "WRK Copilot | AI-built automation with human reliability",
    description:
      "Describe your process, let AI draft the automation, and pay only for successful outcomes.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[#F9FAFB] text-[#0A0A0A]">
        {children}
      </body>
    </html>
  );
}

