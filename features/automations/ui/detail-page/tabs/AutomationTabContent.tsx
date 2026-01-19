import React from "react";
import { cn } from "@/lib/utils";
import type { AutomationTab } from "@/lib/automations/tabs";

interface AutomationTabContentProps {
  activeTab: AutomationTab;
  workflowContent: React.ReactNode;
  chatContent: React.ReactNode;
  overviewContent: React.ReactNode;
  buildStatusContent: React.ReactNode;
  activityContent: React.ReactNode;
  settingsContent: React.ReactNode;
  errorBanner?: React.ReactNode;
}

export function AutomationTabContent({
  activeTab,
  workflowContent,
  chatContent,
  overviewContent,
  buildStatusContent,
  activityContent,
  settingsContent,
  errorBanner,
}: AutomationTabContentProps) {
  return (
    <div
      className={cn(
        "flex-1",
        activeTab === "Workflow" || activeTab === "Chat" ? "flex flex-col overflow-hidden" : "overflow-y-auto"
      )}
    >
      {activeTab === "Workflow" ? (
        <>
          {errorBanner ? <div className="px-6 pt-6">{errorBanner}</div> : null}
          <div className="flex-1 min-h-0">{workflowContent}</div>
        </>
      ) : activeTab === "Chat" ? (
        <div className="flex-1 min-h-0">{chatContent}</div>
      ) : (
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
          {errorBanner}
          {activeTab === "Overview"
            ? overviewContent
            : activeTab === "Build Status"
            ? buildStatusContent
            : activeTab === "Activity"
            ? activityContent
            : settingsContent}
        </div>
      )}
    </div>
  );
}
