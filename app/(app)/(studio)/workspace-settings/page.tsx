"use client";

import { WorkspaceSettings } from "@/components/settings/WorkspaceSettings";
import { useSearchParams } from "next/navigation";

type WorkspaceSettingsTab = "profile" | "billing" | "teams";

export default function WorkspaceSettingsPage() {
  const searchParams = useSearchParams();
  const tab = (searchParams?.get("tab") as WorkspaceSettingsTab) ?? undefined;

  return (
    <div className="h-full overflow-hidden">
      <WorkspaceSettings defaultTab={tab || "profile"} />
    </div>
  );
}
