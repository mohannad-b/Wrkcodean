"use client";

import { WorkspaceSettings } from "@/components/settings/WorkspaceSettings";
import { useSearchParams } from "next/navigation";

export default function WorkspaceSettingsPage() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") as
    | "profile"
    | "billing"
    | "members"
    | "systems"
    | "notifications"
    | "security"
    | "branding"
    | undefined;

  return (
    <div className="h-full overflow-hidden">
      <WorkspaceSettings defaultTab={tab || "profile"} />
    </div>
  );
}



