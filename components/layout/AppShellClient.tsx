"use client";

import { ReactNode, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { UserProfileProvider } from "@/components/providers/user-profile-provider";
import { UserProfile } from "@/lib/user/profile-shared";
import { cn } from "@/lib/utils";
import { fetchVendorCssSnapshot, sendAgentLog } from "@/features/layout/services/vendorInspector";

const SIDEBAR_STORAGE_KEY = "wrk:sidebar-collapsed";

interface AppShellClientProps {
  children: ReactNode;
  initialProfile: UserProfile | null;
  initialLastUpdatedAt: string | null;
}

export function AppShellClient({ children, initialProfile, initialLastUpdatedAt }: AppShellClientProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const contentPaddingClass = sidebarCollapsed ? "md:pl-12" : "md:pl-64";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const storedValue = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (storedValue !== null) {
        setSidebarCollapsed(storedValue === "true");
      }
    } catch {
      // Ignore read errors
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "true" : "false");
    } catch {
      // Ignore write errors (e.g., private mode)
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const vendorLink = document.querySelector('link[href*="vendor.css"]') as HTMLLinkElement | null;

    // #region agent log
    sendAgentLog({
      sessionId: "debug-session",
      runId: "baseline",
      hypothesisId: "H1",
      location: "components/layout/AppShellClient.tsx:vendor-css",
      message: "vendor.css link discovery",
      data: {
        href: vendorLink?.href ?? null,
        tag: vendorLink?.tagName ?? null,
        rel: vendorLink && "rel" in vendorLink ? (vendorLink as HTMLLinkElement).rel : null,
        as: vendorLink && "as" in vendorLink ? (vendorLink as HTMLLinkElement).as : null,
      },
      timestamp: Date.now(),
    });
    // #endregion

    if (!vendorLink?.href) {
      return;
    }

    const inspectVendorCss = async () => {
      try {
        const { response, contentType, text } = await fetchVendorCssSnapshot(vendorLink.href);

        // #region agent log
        sendAgentLog({
          sessionId: "debug-session",
          runId: "baseline",
          hypothesisId: "H2",
          location: "components/layout/AppShellClient.tsx:vendor-css",
          message: "vendor.css response snapshot",
          data: {
            status: response.status,
            contentType,
            length: text.length,
            prefix: text.slice(0, 120),
          },
          timestamp: Date.now(),
        });
        // #endregion
      } catch (error) {
        // #region agent log
        sendAgentLog({
          sessionId: "debug-session",
          runId: "baseline",
          hypothesisId: "H3",
          location: "components/layout/AppShellClient.tsx:vendor-css",
          message: "vendor.css fetch failed",
          data: { error: error instanceof Error ? error.message : String(error) },
          timestamp: Date.now(),
        });
        // #endregion
      }
    };

    void inspectVendorCss();

    const vendorScripts = Array.from(document.querySelectorAll('script[src*="vendor.css"]')) as HTMLScriptElement[];
    const allScripts = Array.from(document.querySelectorAll("script[src]")) as HTMLScriptElement[];
    const sampleScripts = allScripts.slice(0, 5).map((s) => s.src);

    // #region agent log
    sendAgentLog({
      sessionId: "debug-session",
      runId: "baseline",
      hypothesisId: "H4",
      location: "components/layout/AppShellClient.tsx:scripts-scan",
      message: "script tags scan",
      data: {
        vendorScriptCount: vendorScripts.length,
        vendorScriptSrc: vendorScripts.map((s) => s.src),
        sampleScriptSrc: sampleScripts,
        totalScripts: allScripts.length,
      },
      timestamp: Date.now(),
    });
    // #endregion

    if (vendorScripts[0]) {
      const s = vendorScripts[0];
      const attrs: Record<string, unknown> = {
        async: s.async,
        defer: s.defer,
        type: s.type || null,
        noModule: s.noModule,
        crossOrigin: s.crossOrigin || null,
        nonce: s.nonce || null,
        dataset: { ...s.dataset },
        parent: s.parentElement?.tagName ?? null,
        outer: s.outerHTML.slice(0, 200),
      };

      // #region agent log
      sendAgentLog({
        sessionId: "debug-session",
        runId: "baseline",
        hypothesisId: "H5",
        location: "components/layout/AppShellClient.tsx:script-attrs",
        message: "vendor.css script attributes",
        data: attrs,
        timestamp: Date.now(),
      });
      // #endregion
    }
  }, []);

  return (
    <UserProfileProvider initialProfile={initialProfile} initialLastUpdatedAt={initialLastUpdatedAt}>
      <div className="h-screen bg-[#F5F5F5] font-sans text-[#1A1A1A] flex overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} onToggle={setSidebarCollapsed} />
        <main className={cn("flex-1 flex flex-col overflow-x-hidden overflow-y-auto transition-all duration-300", contentPaddingClass)}>
          {children}
        </main>
      </div>
    </UserProfileProvider>
  );
}

