"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActivityItem {
  id: string;
  action: string;
  displayText: string;
  category: string;
  user: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface ActivityTimelineProps {
  automationVersionId: string;
  limit?: number;
  showExport?: boolean;
  showHeader?: boolean;
  refreshToken?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  blueprint: "bg-pink-500",
  quote: "bg-amber-500",
  task: "bg-blue-500",
  build: "bg-green-500",
  file: "bg-purple-500",
  message: "bg-cyan-500",
  version: "bg-gray-500",
  other: "bg-gray-400",
};

export function ActivityTimeline({
  automationVersionId,
  limit = 50,
  showExport = true,
  showHeader = true,
  refreshToken = 0,
}: ActivityTimelineProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!automationVersionId) {
      setActivities([]);
      setError("Select a version to view activity");
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    async function loadActivities() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(
          `/api/automation-versions/${automationVersionId}/activity?limit=${limit}`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error("Failed to load activity");
        }
        const data = await response.json();
        if (isMounted) {
          setActivities(Array.isArray(data.activities) ? data.activities : []);
        }
      } catch (err) {
        if (!controller.signal.aborted && isMounted) {
          setError(err instanceof Error ? err.message : "Unable to load activity");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadActivities();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [automationVersionId, limit, refreshToken]);

  const handleExport = () => {
    if (!activities.length) {
      return;
    }
    const rows = [
      ["Timestamp", "Action", "User", "Details"].join(","),
      ...activities.map((activity) =>
        [
          new Date(activity.timestamp).toISOString(),
          activity.action,
          activity.user,
          activity.displayText.replace(/"/g, '""'),
        ]
          .map((value) => `"${value}"`)
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `activity-log-${automationVersionId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const timelineItems = useMemo(
    () =>
      activities.map((activity) => ({
        ...activity,
        color: CATEGORY_COLORS[activity.category] ?? CATEGORY_COLORS.other,
      })),
    [activities]
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((value) => (
          <div key={value} className="flex gap-3 animate-pulse">
            <div className="w-3 h-3 rounded-full bg-gray-200 mt-1.5" />
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-red-500">{error}</div>;
  }

  if (activities.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-8 text-center">
        No activity yet
      </div>
    );
  }

  return (
    <div>
      {showHeader && (
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Project Timeline</h2>
          {showExport && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export Log
            </Button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {timelineItems.map((activity, index) => (
          <div key={activity.id} className="flex gap-3">
            <div className="relative">
              <div className={`w-3 h-3 rounded-full mt-1.5 ${activity.color}`} />
              {index < timelineItems.length - 1 && (
                <div className="absolute top-4 left-1.5 w-px h-full bg-gray-200 -translate-x-1/2" />
              )}
            </div>
            <div className="flex-1 pb-4">
              <p className="text-sm text-gray-900">{activity.displayText}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


