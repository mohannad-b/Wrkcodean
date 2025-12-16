"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MessageSquare,
  AlertCircle,
  PlayCircle,
  GitCommit,
  FileEdit,
  Search,
  Filter,
  ArrowRight,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface ActivityTabProps {
  automationVersionId: string;
  onNavigateToBlueprint?: () => void;
}

type ActivityItem = {
  id: string;
  action: string;
  displayText: string;
  category: string;
  user: string;
  userAvatarUrl?: string | null;
  userFirstName?: string | null;
  userLastName?: string | null;
  timestamp: string;
};

type ActivityCard = ActivityItem & {
  type: "comment" | "change" | "error" | "test" | "update";
  icon: React.ComponentType<{ size?: number | string }>;
  colorClass: string;
};

const FILTERS = ["all", "comment", "change", "tests", "error"] as const;

export function ActivityTab({ automationVersionId, onNavigateToBlueprint }: ActivityTabProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [search, setSearch] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(0);

  useEffect(() => {
    if (!automationVersionId) {
      setActivities([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function fetchActivity() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(
          `/api/automation-versions/${automationVersionId}/activity?limit=100`,
          { signal: controller.signal }
        );
        if (!response.ok) {
          throw new Error("Failed to load activity");
        }
        const data = await response.json();
        if (!cancelled) {
          setActivities(Array.isArray(data.activities) ? data.activities : []);
        }
      } catch (err) {
        if (!cancelled && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Unable to load activity");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchActivity();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [automationVersionId, needsRefresh]);

  const cards = useMemo<ActivityCard[]>(() => activities.map(mapToCard), [activities]);

  const filteredCards = useMemo(() => {
    return cards.filter((card) => {
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "tests"
            ? card.type === "test"
            : card.type === filter;
      const matchesSearch =
        search.trim().length === 0 ||
        card.displayText.toLowerCase().includes(search.toLowerCase()) ||
        card.user.toLowerCase().includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [cards, filter, search]);

  const handleExport = () => {
    if (!activities.length) return;
    const csv = [
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
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `activity-log-${automationVersionId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveNote = async () => {
    const trimmed = adminNote.trim();
    if (!trimmed || !automationVersionId) return;
    setIsSaving(true);
    setNoteError(null);
    try {
      const response = await fetch(`/api/automation-versions/${automationVersionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "system",
          content: `[Admin Note] ${trimmed}`,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? "Failed to save note");
      }
      setAdminNote("");
      setNeedsRefresh((count) => count + 1);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Unable to save note");
    } finally {
      setIsSaving(false);
    }
  };

  if (!automationVersionId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500">
        Select a version to view its activity.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="p-8 max-w-5xl mx-auto pb-32 space-y-10">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[#0A0A0A]">Activity Log</h2>
            <p className="text-sm text-gray-500">Track every change, comment, and run for this automation.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9 w-[220px] h-9 text-xs"
                placeholder="Search activity..."
              />
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleExport}>
              <Download size={14} />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9">
              <Filter size={14} />
            </Button>
          </div>
        </div>

        <Tabs value={filter} onValueChange={(value) => setFilter(value as (typeof FILTERS)[number])} className="w-full">
          <TabsList className="bg-white p-1 rounded-full border border-gray-200 w-full max-w-2xl">
            <TabsTrigger value="all" className="text-xs">
              All Activity
            </TabsTrigger>
            <TabsTrigger value="comment" className="text-xs">
              Comments
            </TabsTrigger>
            <TabsTrigger value="change" className="text-xs">
              Changes
            </TabsTrigger>
            <TabsTrigger value="tests" className="text-xs">
              Tests & Runs
            </TabsTrigger>
            <TabsTrigger value="error" className="text-xs">
              Errors
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((value) => (
              <div key={value} className="bg-white p-5 rounded-xl border border-gray-200 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-full mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-sm text-red-500">{error}</div>
        ) : filteredCards.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
            <p className="text-sm text-gray-500">No activity yet. Start drafting or editing to see updates here.</p>
          </div>
        ) : (
          <div className="space-y-6 relative before:absolute before:left-5 before:top-2 before:h-full before:w-px before:bg-gray-100">
            {filteredCards.map((item) => (
              <div key={item.id} className="relative pl-12 group">
                <div
                  className={`absolute left-0 top-0 w-10 h-10 rounded-full flex items-center justify-center border-4 border-white shadow-sm z-10 ${item.colorClass}`}
                >
                  <item.icon size={16} />
                </div>

                <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Avatar className="w-7 h-7">
                        {item.userAvatarUrl ? (
                          <AvatarImage src={item.userAvatarUrl} alt={item.user} />
                        ) : null}
                        <AvatarFallback className="text-xs bg-gray-100">
                          {item.userFirstName && item.userLastName
                            ? `${item.userFirstName.charAt(0)}${item.userLastName.charAt(0)}`.toUpperCase()
                            : item.user.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-bold text-[#0A0A0A]">{item.user}</span>
                      <Badge
                        variant="secondary"
                        className="bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200 text-[10px] font-mono"
                      >
                        {item.action.replace(/automation\./g, "").replace(/\./g, " ")}
                      </Badge>
                    </div>
                    <span className="text-xs text-gray-400 font-medium">
                      {new Date(item.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 leading-relaxed mb-3">{item.displayText}</p>

                  <div className="flex items-center gap-4">
                    <button
                      className="text-xs text-gray-400 hover:text-[#E43632] font-medium flex items-center gap-1 transition-colors"
                      onClick={() => onNavigateToBlueprint?.()}
                    >
                      View on Blueprint <ArrowRight size={10} />
                    </button>
                    {item.type === "comment" && (
                      <button className="text-xs text-gray-400 hover:text-gray-600 font-medium">Reply</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-[#0A0A0A]">Admin Notes</h3>
            <span className="text-xs text-gray-400">Share context with your teammates</span>
          </div>
          <Textarea
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
            placeholder="Leave a note for the ops team..."
            className="min-h-[120px] mb-3"
          />
          {noteError ? <p className="text-sm text-red-500 mb-2">{noteError}</p> : null}
          <div className="flex justify-end">
            <Button onClick={handleSaveNote} disabled={isSaving || adminNote.trim().length === 0}>
              {isSaving ? "Saving..." : "Save Note"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function mapToCard(activity: ActivityItem): ActivityCard {
  const normalizedAction = activity.action.toLowerCase();
  if (normalizedAction.includes("message") || normalizedAction.includes("comment")) {
    return {
      ...activity,
      type: "comment",
      icon: MessageSquare,
      colorClass: "text-gray-600 bg-gray-100",
    };
  }
  if (normalizedAction.includes("error") || normalizedAction.includes("failed")) {
    return {
      ...activity,
      type: "error",
      icon: AlertCircle,
      colorClass: "text-red-600 bg-red-50",
    };
  }
  if (normalizedAction.includes("build") || normalizedAction.includes("test") || normalizedAction.includes("run")) {
    return {
      ...activity,
      type: "test",
      icon: PlayCircle,
      colorClass: "text-emerald-600 bg-emerald-50",
    };
  }
  if (normalizedAction.includes("deploy") || normalizedAction.includes("version") || normalizedAction.includes("quote")) {
    return {
      ...activity,
      type: "update",
      icon: GitCommit,
      colorClass: "text-purple-600 bg-purple-50",
    };
  }
  return {
    ...activity,
    type: "change",
    icon: FileEdit,
    colorClass: "text-blue-600 bg-blue-50",
  };
}

