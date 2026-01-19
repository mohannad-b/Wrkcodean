import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AUTOMATION_TABS, type AutomationTab } from "@/lib/automations/tabs";
import { SaveIndicator, type SaveState } from "./SaveIndicator";
import { AutomationVersionSelector } from "../version-selector/AutomationVersionSelector";
import type { VersionOption } from "@/components/ui/VersionSelector";

interface AutomationDetailHeaderProps {
  automationName: string;
  versionOptions: VersionOption[];
  selectedVersionId: string | null;
  creatingVersion: boolean;
  onVersionChange: (versionId: string) => void;
  onNewVersion: () => void;
  onRefresh: () => void;
  isLoadingVersion: boolean;
  saveState: SaveState;
  lastSavedAt: Date | null;
  saveError?: string | null;
  onRetrySave: () => void;
  activeTab: AutomationTab;
  onTabChange: (tab: AutomationTab) => void;
}

export function AutomationDetailHeader({
  automationName,
  versionOptions,
  selectedVersionId,
  creatingVersion,
  onVersionChange,
  onNewVersion,
  onRefresh,
  isLoadingVersion,
  saveState,
  lastSavedAt,
  saveError,
  onRetrySave,
  activeTab,
  onTabChange,
}: AutomationDetailHeaderProps) {
  return (
    <div className="sticky top-0 z-30 bg-white border-b border-gray-200">
      <div className="max-w-[1600px] mx-auto">
        <div className="h-14 flex items-center justify-between px-6 border-b border-gray-100">
          <div className="flex items-center gap-3 text-xs text-gray-500 font-semibold uppercase tracking-wide">
            <Link href="/automations" className="hover:text-[#0A0A0A] transition-colors">
              Automations
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-[#0A0A0A] font-bold">{automationName}</span>
          </div>
        </div>
        <div className="h-12 flex items-center justify-between px-6">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Version</span>
            <AutomationVersionSelector
              versionOptions={versionOptions}
              selectedVersionId={selectedVersionId}
              creatingVersion={creatingVersion}
              onVersionChange={onVersionChange}
              onNewVersion={onNewVersion}
            />
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-gray-400 hover:text-[#0A0A0A]"
              onClick={onRefresh}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            {isLoadingVersion && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                <span>Loading version…</span>
              </div>
            )}
            <SaveIndicator state={saveState} lastSavedAt={lastSavedAt} error={saveError} onRetry={onRetrySave} />
          </div>
          <div className="flex h-full gap-1">
            {AUTOMATION_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={cn(
                  "relative h-full px-4 text-xs font-semibold uppercase tracking-wide transition-colors",
                  activeTab === tab
                    ? "text-[#E43632] bg-red-50/50 border-b-2 border-[#E43632]"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50 border-b-2 border-transparent"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
