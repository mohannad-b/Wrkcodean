"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "./badge";
import { Button } from "./button";
import { Progress } from "./progress";
import { MoreHorizontal, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardAutomation } from "@/lib/mock-dashboard";
import { cardClasses } from "@/components/ui/card-shell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";

interface DashboardAutomationCardProps {
  automation: DashboardAutomation;
}

export function DashboardAutomationCard({ automation }: DashboardAutomationCardProps) {
  const router = useRouter();
  const toast = useToast();
  const pendingLabel = "Pending";
  const runsDisplay = automation.runs ? automation.runs.toLocaleString() : pendingLabel;
  const successDisplay =
    typeof automation.success === "number" && automation.success > 0 ? `${automation.success.toFixed(1)}%` : pendingLabel;
  const spendDisplay =
    typeof automation.spend === "number" && automation.spend > 0
      ? `$${Math.round(automation.spend).toLocaleString()}`
      : pendingLabel;

  return (
    <Link href={`/automations/${automation.id}`}>
      <div className={cardClasses("p-6 relative hover:border-gray-300 transition-colors")}>
        {automation.needsApproval && (
          <div className="absolute -top-3 right-4">
            <Badge className="bg-[#E43632] hover:bg-[#C12E2A] text-white shadow-md border-none px-3 py-1">
              Action: Review Quote
            </Badge>
          </div>
        )}

        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center border",
                automation.status === "Blocked"
                  ? "bg-red-50 border-red-100 text-red-600"
                  : "bg-gray-50 border-gray-100 text-gray-600"
              )}
            >
              <Zap size={20} />
            </div>
            <div>
              <h3 className="font-bold text-[#0A0A0A]">{automation.name}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge
                  variant="outline"
                  className="text-[10px] h-5 px-1.5 bg-gray-50 text-gray-500 border-gray-200"
                >
                  {automation.version}
                </Badge>
                <span
                  className={cn(
                    "text-[10px] font-medium flex items-center gap-1",
                    automation.status === "Live"
                      ? "text-emerald-600"
                      : automation.status === "Build in Progress"
                        ? "text-[#E43632]"
                        : automation.status === "Blocked"
                          ? "text-orange-600"
                          : automation.status === "Awaiting Client Approval"
                            ? "text-blue-600"
                            : "text-gray-600"
                  )}
                >
                  <div
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      automation.status === "Live"
                        ? "bg-emerald-500"
                        : automation.status === "Build in Progress"
                          ? "bg-[#E43632]"
                          : automation.status === "Blocked"
                            ? "bg-orange-500"
                            : automation.status === "Awaiting Client Approval"
                              ? "bg-blue-500"
                              : "bg-gray-400"
                    )}
                  />
                  {automation.status}
                </span>
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              asChild
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400" aria-label="Automation actions">
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="hover:bg-gray-50 focus:bg-gray-50 active:bg-gray-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push(`/automations/${automation.id}?tab=Workflow`);
                }}
              >
                Edit Workflow
              </DropdownMenuItem>
              <DropdownMenuItem
                className="hover:bg-gray-50 focus:bg-gray-50 active:bg-gray-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push(`/automations/${automation.id}?tab=Activity`);
                }}
              >
                View Activity
              </DropdownMenuItem>
              <DropdownMenuItem
                className="hover:bg-gray-50 focus:bg-gray-50 active:bg-gray-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!automation.latestVersionId) {
                    toast({
                      variant: "warning",
                      title: "No version to duplicate",
                      description: "We could not find a source version on this automation.",
                    });
                    return;
                  }

                  void (async () => {
                    try {
                      const response = await fetch(`/api/automations/${automation.id}/versions`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ copyFromVersionId: automation.latestVersionId }),
                      });

                      const payload = (await response.json().catch(() => ({}))) as
                        | { version?: { id: string; versionLabel: string }; error?: string }
                        | undefined;

                      if (!response.ok || !payload?.version?.id) {
                        throw new Error(payload?.error ?? "Unable to duplicate automation");
                      }

                      const { version } = payload;
                      toast({
                        variant: "success",
                        title: "Version duplicated",
                        description: `Created ${version.versionLabel}. Redirecting...`,
                      });
                      router.push(`/automations/${automation.id}?version=${version.id}&tab=Workflow`);
                    } catch (error) {
                      const message = error instanceof Error ? error.message : "Failed to duplicate automation";
                      toast({ variant: "error", title: "Duplicate failed", description: message });
                    }
                  })();
                }}
              >
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-red-600 hover:bg-red-50 focus:bg-red-50 active:bg-red-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!automation.latestVersionId) {
                    toast({
                      variant: "warning",
                      title: "No version to archive",
                      description: "We could not find a version on this automation to archive.",
                    });
                    return;
                  }

                  void (async () => {
                    try {
                      const response = await fetch(`/api/automation-versions/${automation.latestVersionId}/status`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "Archived" }),
                      });

                      const payload = (await response.json().catch(() => ({}))) as { error?: string } | undefined;
                      if (!response.ok) {
                        throw new Error(payload?.error ?? "Unable to archive automation");
                      }

                      toast({
                        variant: "success",
                        title: "Automation archived",
                        description: `${automation.name} was archived.`,
                      });
                      router.refresh();
                    } catch (error) {
                      const message = error instanceof Error ? error.message : "Failed to archive automation";
                      toast({ variant: "error", title: "Archive failed", description: message });
                    }
                  })();
                }}
              >
                Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {automation.status === "Build in Progress" && automation.progress !== undefined ? (
          <div className="space-y-2 mt-6 mb-2">
            <div className="flex justify-between text-xs font-medium text-gray-500">
              <span>Build in Progress</span>
              <span>{automation.progress}%</span>
            </div>
            <Progress
              value={automation.progress}
              className="h-2 bg-gray-100"
              indicatorClassName="bg-[#E43632]"
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-50">
            <div>
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">
                Runs (30d)
              </p>
              <p className="text-lg font-bold text-[#0A0A0A]">{runsDisplay}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">
                Success
              </p>
              <p
                className={cn(
                  "text-lg font-bold",
                  typeof automation.success === "number" && automation.success < 99 ? "text-amber-600" : "text-emerald-600"
                )}
              >
                {successDisplay}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Spend</p>
              <p className="text-lg font-bold text-[#0A0A0A]">{spendDisplay}</p>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}




