import { Calendar, Edit3, History, Loader2, Play, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import type { AutomationLifecycleStatus } from "@/lib/automations/status";
import type { KpiStat } from "@/lib/metrics/kpi";
import type { AutomationTask } from "@/lib/automations/tasks";
import { NeedsAttentionCard } from "@/components/automations/NeedsAttentionCard";
import { KpiCard } from "@/components/ui/KpiCard";

export type ActivityEntry = {
  title: string;
  user: string;
  time: string;
  description: string;
  icon: React.ComponentType<{ size?: number | string }>;
  iconBg: string;
  iconColor: string;
};

interface OverviewPanelProps {
  automationName: string;
  automationDescription: string | null;
  versionLabel: string;
  versionStatus?: AutomationLifecycleStatus;
  quoteStatus?: string | null;
  updatedAtLabel: string;
  onInviteTeam: () => void;
  onRunTest: () => void;
  onEditWorkflow: () => void;
  kpiStats: KpiStat[];
  metricsLoading?: boolean;
  metricsError?: string | null;
  recentActivityEntries: ActivityEntry[];
  recentActivityLoading?: boolean;
  recentActivityError?: string | null;
  onViewAllActivity: () => void;
  attentionTasks: AutomationTask[];
  onGoToTasks: () => void;
}

export function OverviewPanel({
  automationName,
  automationDescription,
  versionLabel,
  versionStatus,
  quoteStatus,
  updatedAtLabel,
  onInviteTeam,
  onRunTest,
  onEditWorkflow,
  kpiStats,
  metricsLoading,
  metricsError,
  recentActivityEntries,
  recentActivityLoading,
  recentActivityError,
  onViewAllActivity,
  attentionTasks,
  onGoToTasks,
}: OverviewPanelProps) {
  return (
    <div className="space-y-8">
      <AutomationHeader
        name={automationName}
        description={automationDescription}
        versionLabel={versionLabel}
        versionStatus={versionStatus}
        quoteStatus={quoteStatus}
        updatedAtLabel={updatedAtLabel}
        onInviteTeam={onInviteTeam}
        onRunTest={onRunTest}
        onEditWorkflow={onEditWorkflow}
      />

      <OverviewMetrics stats={kpiStats} isLoading={metricsLoading} error={metricsError} />

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <RecentActivity
            entries={recentActivityEntries}
            isLoading={recentActivityLoading}
            error={recentActivityError}
            onViewAll={onViewAllActivity}
          />
        </div>

        <div className="space-y-6">
          <NeedsAttentionCard tasks={attentionTasks} onGoToWorkflow={onGoToTasks} />
        </div>
      </section>
    </div>
  );
}

interface AutomationHeaderProps {
  name: string;
  description: string | null;
  versionLabel: string;
  versionStatus?: AutomationLifecycleStatus;
  quoteStatus?: string | null;
  updatedAtLabel: string;
  onInviteTeam: () => void;
  onRunTest: () => void;
  onEditWorkflow: () => void;
}

function AutomationHeader({
  name,
  description,
  versionLabel,
  versionStatus,
  quoteStatus,
  updatedAtLabel,
  onInviteTeam,
  onRunTest,
  onEditWorkflow,
}: AutomationHeaderProps) {
  return (
    <section className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
      <div className="space-y-2">
        <div className="flex items-center flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-[#0A0A0A] leading-tight">{name}</h1>
          {versionStatus ? <StatusBadge status={versionStatus} /> : null}
          {quoteStatus ? <StatusBadge status={quoteStatus} /> : null}
        </div>
        <p className="text-gray-500 max-w-2xl leading-relaxed text-sm">
          {description ?? "No description provided yet. Capture the goal of this automation so stakeholders stay aligned."}
        </p>
        <div className="flex items-center gap-4 text-xs text-gray-400 pt-1 flex-wrap">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            {versionLabel} (Current)
          </span>
          <span className="w-1 h-1 rounded-full bg-gray-300" />
          <span className="flex items-center gap-1.5">
            <Calendar size={12} />
            Last updated {updatedAtLabel} by <span className="text-gray-600 font-medium">Wrk Ops</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <Button onClick={onInviteTeam} variant="outline" className="h-9 text-xs font-medium bg-white hover:bg-gray-50 text-gray-700 border-gray-200">
          <Users size={14} className="mr-2" />
          Invite Team
        </Button>
        <Button variant="outline" className="h-9 text-xs font-medium bg-white hover:bg-gray-50 text-gray-700 border-gray-200" onClick={onRunTest}>
          <Play size={14} className="mr-2" />
          Run Test
        </Button>
        <Button
          onClick={onEditWorkflow}
          className="h-9 text-xs font-bold bg-[#0A0A0A] hover:bg-gray-900 text-white shadow-lg shadow-gray-900/10 transition-all hover:-translate-y-0.5"
        >
          <Edit3 size={14} className="mr-2" />
          Edit Workflow
        </Button>
      </div>
    </section>
  );
}

interface OverviewMetricsProps {
  stats: KpiStat[];
  isLoading?: boolean;
  error?: string | null;
}

function OverviewMetrics({ stats, isLoading, error }: OverviewMetricsProps) {
  return (
    <section className="space-y-2">
      {error ? <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Metrics unavailable right now: {error}</p> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {stats.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} isLoading={isLoading} />
        ))}
      </div>
    </section>
  );
}

interface RecentActivityProps {
  entries: ActivityEntry[];
  onViewAll?: () => void;
  isLoading?: boolean;
  error?: string | null;
}

function RecentActivity({ entries, onViewAll, isLoading, error }: RecentActivityProps) {
  return (
    <Card className="shadow-sm border-gray-100">
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold text-[#0A0A0A]">
          <History size={16} className="text-gray-400" />
          Recent activity
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto p-0 text-xs text-gray-400 hover:text-[#E43632]"
          onClick={onViewAll}
        >
          View all
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="py-4 text-sm text-red-600">{error}</div>
        ) : entries.length === 0 ? (
          <div className="py-4 text-sm text-gray-500">No activity yet.</div>
        ) : (
          <div className="space-y-8 relative before:absolute before:left-2.5 before:top-2 before:h-full before:w-px before:bg-gray-100">
            {entries.map((entry, index) => (
              <div key={`${entry.title}-${entry.time}-${index}`} className="relative pl-8">
                <div
                  className={cn(
                    "absolute left-0 top-0 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white ring-1 ring-gray-100 shadow-sm",
                    entry.iconBg,
                    entry.iconColor
                  )}
                >
                  <entry.icon size={10} />
                </div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-bold text-gray-900">{entry.title}</p>
                  <span className="text-[10px] text-gray-400">{entry.time}</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{entry.description}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-600 font-bold">
                    {entry.user.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-[10px] text-gray-400">{entry.user}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
