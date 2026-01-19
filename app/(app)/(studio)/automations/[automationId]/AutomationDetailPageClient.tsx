"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAutomationDetailPage } from "@/features/automations/hooks/useAutomationDetailPage";
import { AutomationDetailHeader } from "@/features/automations/ui/detail-page/header/AutomationDetailHeader";
import { OverviewPanel } from "@/features/automations/ui/detail-page/panels/OverviewPanel";
import { MetricConfigModals } from "@/features/automations/ui/detail-page/panels/MetricConfigModals";
import { ProceedingModals } from "@/features/automations/ui/detail-page/panels/ProceedingModals";
import { TaskDrawerPanel } from "@/features/automations/ui/detail-page/panels/TaskDrawerPanel";
import { AutomationTabContent } from "@/features/automations/ui/detail-page/tabs/AutomationTabContent";
import { ActivityTab } from "@/features/automations/ui/detail-page/tabs/ActivityTab";
import { BuildStatusTab } from "@/features/automations/ui/detail-page/tabs/BuildStatusTab";
import { ChatTab } from "@/features/automations/ui/detail-page/tabs/ChatTab";
import { SettingsTab } from "@/features/automations/ui/detail-page/tabs/SettingsTab";

const WorkflowTab = dynamic(
  () => import("@/features/automations/ui/detail-page/tabs/WorkflowTab").then((m) => m.WorkflowTab),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <span className="text-sm text-gray-500">Loading workflow…</span>
      </div>
    ),
  }
);

export interface AutomationDetailPageProps {
  params: {
    automationId: string;
  };
}

export default function AutomationDetailPage({ params }: AutomationDetailPageProps) {
  const router = useRouter();
  const {
    automation,
    loading,
    error,
    activeTab,
    headerProps,
    overviewProps,
    workflowTabProps,
    buildStatusTabProps,
    activityTabProps,
    settingsTabProps,
    metricModalsProps,
    proceedingModalsProps,
    taskDrawerProps,
    chatHasAccess,
    chatAccessChecking,
  } = useAutomationDetailPage({ automationId: params.automationId });

  if (loading && !automation) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="p-10">
        <p className="text-sm text-gray-600">Automation not found.</p>
        <Button variant="link" className="px-0" onClick={() => router.push("/automations")}>
          Back to automations
        </Button>
      </div>
    );
  }

  const errorBanner = error ? (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
  ) : null;

  const overviewContent = <OverviewPanel {...overviewProps} />;

  const workflowContent = activeTab === "Workflow" ? <WorkflowTab {...workflowTabProps} /> : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
      <AutomationDetailHeader {...headerProps} />
      <AutomationTabContent
        activeTab={activeTab}
        workflowContent={workflowContent}
        chatContent={activeTab === "Chat" ? <ChatTab isChecking={chatAccessChecking} hasAccess={chatHasAccess} automationVersionId={activityTabProps.automationVersionId} automationName={automation.name} /> : null}
        overviewContent={overviewContent}
        buildStatusContent={<BuildStatusTab {...buildStatusTabProps} />}
        activityContent={<ActivityTab {...activityTabProps} />}
        settingsContent={<SettingsTab {...settingsTabProps} />}
        errorBanner={errorBanner}
      />

      <MetricConfigModals {...metricModalsProps} />
      <TaskDrawerPanel {...taskDrawerProps} />
      <ProceedingModals {...proceedingModalsProps} />
    </div>
  );
}
