"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  CheckSquare,
  DollarSign,
  Filter,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search as SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ProjectStatus, PricingStatus } from "@/lib/types";
import { useToast } from "@/components/ui/use-toast";
import type { AutomationLifecycleStatus } from "@/lib/automations/status";

type ProjectListItem = {
  id: string;
  name: string;
  status: AutomationLifecycleStatus;
  updatedAt: string | null;
  automation: { id: string; name: string } | null;
  version: { id: string; versionLabel: string; status: string } | null;
  latestQuote: { id: string; status: string } | null;
};

type QuoteFilter = "ALL" | "NO_QUOTE" | "DRAFT" | "SENT" | "SIGNED";

type AdminProjectCard = {
  id: string;
  clientId: string;
  clientName: string;
  automationName: string;
  versionLabel: string;
  type: "New Automation" | "Revision";
  status: ProjectStatus;
  lifecycleStatus: AutomationLifecycleStatus;
  checklistProgress: number;
  pricingStatus: PricingStatus;
  owner: { name: string; avatar: string };
  eta: string;
  lastUpdated: string;
  lastUpdatedRelative: string;
  description: string;
  systems: string[];
  risk: "Low" | "Medium" | "High";
  latestQuoteStatus: QuoteFilter | null;
};

const STATUS_ORDER: ProjectStatus[] = [
  "Intake in Progress",
  "Needs Pricing",
  "Awaiting Client Approval",
  "Build in Progress",
  "QA & Testing",
  "Ready to Launch",
  "Live",
  "Blocked",
  "Archived",
];

const PROJECT_STATUS_TO_LIFECYCLE: Partial<Record<ProjectStatus, AutomationLifecycleStatus>> = {
  "Intake in Progress": "DRAFT",
  "Needs Pricing": "NEEDS_PRICING",
  "Build in Progress": "READY_TO_BUILD",
  Live: "LIVE",
};

const SENSITIVE_STATUSES: ProjectStatus[] = ["Live", "Blocked", "Archived"];

const STATUS_STYLES: Record<ProjectStatus, { bg: string; text: string; border: string; dot: string }> = {
  "Intake in Progress": {
    bg: "bg-gray-50",
    text: "text-gray-600",
    border: "border-gray-200",
    dot: "bg-gray-400",
  },
  "Needs Pricing": {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  "Awaiting Client Approval": {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    dot: "bg-blue-500",
  },
  "Build in Progress": {
    bg: "bg-red-50",
    text: "text-[#E43632]",
    border: "border-red-200",
    dot: "bg-[#E43632]",
  },
  "QA & Testing": {
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-purple-200",
    dot: "bg-purple-500",
  },
  "Ready to Launch": {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
  Live: {
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    border: "border-emerald-300",
    dot: "bg-emerald-600",
  },
  Blocked: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
    dot: "bg-orange-500",
  },
  Archived: {
    bg: "bg-gray-100",
    text: "text-gray-500",
    border: "border-gray-200",
    dot: "bg-gray-400",
  },
};

const PRICING_BADGE_STYLES: Record<PricingStatus, string> = {
  "Not Generated": "text-gray-500 bg-gray-50 border-gray-200",
  Draft: "text-amber-700 bg-amber-50 border-amber-200",
  Sent: "text-purple-700 bg-purple-50 border-purple-200",
  Signed: "text-emerald-700 bg-emerald-50 border-emerald-200",
};

const OWNER_POOL = [
  "Ava Chen",
  "Noah Patel",
  "Isabelle Torres",
  "Leo Park",
  "Monica Ruiz",
  "Priya Singh",
  "Daniel Cho",
];

const TYPE_OPTIONS: Array<"New Automation" | "Revision"> = ["New Automation", "Revision"];
const RISK_OPTIONS: Array<"Low" | "Medium" | "High"> = ["Low", "Medium", "High"];
const ETA_OPTIONS = ["Today", "Tomorrow", "Next Week", "TBD"];
const SYSTEM_POOL = ["Salesforce", "Workday", "Slack", "Email", "Zendesk", "Asana"];
const BUILD_STATUS_FILTERS: AutomationLifecycleStatus[] = ["READY_TO_BUILD", "LIVE"];
const QUOTE_STATUS_FILTERS: QuoteFilter[] = ["DRAFT", "SENT", "SIGNED"];

const formatQuoteLabel = (value: QuoteFilter) => {
  if (value === "ALL") return "All quotes";
  if (value === "NO_QUOTE") return "No quote";
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
};

const formatRelativeTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getOwnerAvatar = (name: string) =>
  `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundType=gradientLinear`;

const mapLifecycleToProjectStatus = (status: AutomationLifecycleStatus): ProjectStatus => {
  switch (status) {
    case "NEEDS_PRICING":
      return "Needs Pricing";
    case "READY_TO_BUILD":
      return "Build in Progress";
    case "LIVE":
      return "Live";
    case "ARCHIVED":
      return "Archived";
    case "DRAFT":
    default:
      return "Intake in Progress";
  }
};

const mapQuoteStatusToPricing = (status?: string | null): PricingStatus => {
  if (!status) return "Not Generated";
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "SENT":
      return "Sent";
    case "SIGNED":
      return "Signed";
    default:
      return "Not Generated";
  }
};

const mapProjectToPresentation = (project: ProjectListItem): AdminProjectCard => {
  const seed = hashString(project.id);
  const ownerName = OWNER_POOL[seed % OWNER_POOL.length];
  const lifecycleStatus = project.status ?? "DRAFT";
  const quoteStatus = project.latestQuote?.status ?? null;

  return {
    id: project.id,
    clientId: project.id,
    clientName: project.name,
    automationName: project.automation?.name ?? "Automation archived",
    versionLabel: project.version?.versionLabel ?? "v1.0",
    type: TYPE_OPTIONS[seed % TYPE_OPTIONS.length],
    status: mapLifecycleToProjectStatus(lifecycleStatus),
    lifecycleStatus,
    checklistProgress: 40 + (seed % 55),
    pricingStatus: mapQuoteStatusToPricing(quoteStatus),
    owner: {
      name: ownerName,
      avatar: getOwnerAvatar(ownerName),
    },
    eta: ETA_OPTIONS[seed % ETA_OPTIONS.length],
    lastUpdated: project.updatedAt ?? new Date().toISOString(),
    lastUpdatedRelative: formatRelativeTime(project.updatedAt),
    description: project.automation?.name ?? "Automation initiative",
    systems: [
      SYSTEM_POOL[seed % SYSTEM_POOL.length],
      SYSTEM_POOL[(seed + 2) % SYSTEM_POOL.length],
    ],
    risk: RISK_OPTIONS[seed % RISK_OPTIONS.length],
    latestQuoteStatus: quoteStatus ? (quoteStatus as QuoteFilter) : null,
  };
};

export default function AdminProjectsPage() {
  const router = useRouter();
  const toast = useToast();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "kanban">("kanban");
  const [searchQuery, setSearchQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "New Automation" | "Revision">("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sortBy, setSortBy] = useState("lastUpdated");
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>("ALL");
  const [buildFilter, setBuildFilter] = useState<AutomationLifecycleStatus | "ALL">("ALL");
  const [statusModal, setStatusModal] = useState<{
    isOpen: boolean;
    projectId: string | null;
    newStatus: ProjectStatus | null;
    note: string;
    notifyClient: boolean;
    requireConfirmation: boolean;
  }>({
    isOpen: false,
    projectId: null,
    newStatus: null,
    note: "",
    notifyClient: false,
    requireConfirmation: false,
  });
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/projects", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed to load projects");
      }
      const data = (await response.json()) as { projects: ProjectListItem[] };
      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const presentationProjects = useMemo(
    () => projects.map((project) => mapProjectToPresentation(project)),
    [projects]
  );

  const clients = useMemo(
    () => Array.from(new Set(presentationProjects.map((project) => project.clientName))).sort(),
    [presentationProjects]
  );

  const owners = useMemo(
    () => Array.from(new Set(presentationProjects.map((project) => project.owner.name))).sort(),
    [presentationProjects]
  );

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return presentationProjects
      .filter((project) => {
        if (!query) return true;
        return (
          project.clientName.toLowerCase().includes(query) ||
          project.automationName.toLowerCase().includes(query)
        );
      })
      .filter((project) => (clientFilter === "all" ? true : project.clientName === clientFilter))
      .filter((project) => (statusFilter === "all" ? true : project.status === statusFilter))
      .filter((project) => (typeFilter === "all" ? true : project.type === typeFilter))
      .filter((project) => (ownerFilter === "all" ? true : project.owner.name === ownerFilter))
      .filter((project) => (buildFilter === "ALL" ? true : project.lifecycleStatus === buildFilter))
      .filter((project) => {
        if (quoteFilter === "ALL") return true;
        if (quoteFilter === "NO_QUOTE") return !project.latestQuoteStatus;
        return project.latestQuoteStatus === quoteFilter;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "status":
            return STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
          case "eta":
            return ETA_OPTIONS.indexOf(a.eta) - ETA_OPTIONS.indexOf(b.eta);
          case "client":
            return a.clientName.localeCompare(b.clientName);
          case "owner":
            return a.owner.name.localeCompare(b.owner.name);
          case "lastUpdated":
          default:
            return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
        }
      });
  }, [
    presentationProjects,
    searchQuery,
    clientFilter,
    statusFilter,
    typeFilter,
    ownerFilter,
    buildFilter,
    quoteFilter,
    sortBy,
  ]);

  const isFiltered = useMemo(
    () =>
      Boolean(searchQuery.trim()) ||
      clientFilter !== "all" ||
      statusFilter !== "all" ||
      typeFilter !== "all" ||
      ownerFilter !== "all" ||
      buildFilter !== "ALL" ||
      quoteFilter !== "ALL",
    [searchQuery, clientFilter, statusFilter, typeFilter, ownerFilter, buildFilter, quoteFilter]
  );

  const handleNewProject = () => {
    toast({
      title: "New project creation coming soon",
      description: "Use pricing requests today to open a project automatically.",
    });
  };

  const applyStatusChange = (projectId: string, newStatus: ProjectStatus) => {
    const lifecycle = PROJECT_STATUS_TO_LIFECYCLE[newStatus];
    if (!lifecycle) {
      toast({
        title: "Status not available yet",
        description: "TODO: wire this status to the real admin workflow.",
      });
      return;
    }
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? {
              ...project,
              status: lifecycle,
            }
          : project
      )
    );
    // TODO: replace local state update with API call to admin status endpoint.
    toast({
      title: "Status updated",
      description: `Project moved to ${newStatus}.`,
      variant: "success",
    });
  };

  const handleStatusSelect = (projectId: string, newStatus: ProjectStatus) => {
    if (SENSITIVE_STATUSES.includes(newStatus)) {
      setStatusModal({
        isOpen: true,
        projectId,
        newStatus,
        note: "",
        notifyClient: false,
        requireConfirmation: true,
      });
      return;
    }
    applyStatusChange(projectId, newStatus);
  };

  const closeStatusModal = () =>
    setStatusModal({
      isOpen: false,
      projectId: null,
      newStatus: null,
      note: "",
      notifyClient: false,
      requireConfirmation: false,
    });

  const handleModalConfirm = () => {
    if (statusModal.projectId && statusModal.newStatus) {
      applyStatusChange(statusModal.projectId, statusModal.newStatus);
    }
    closeStatusModal();
  };

  const handleDragStart = (event: React.DragEvent, projectId: string) => {
    event.dataTransfer.effectAllowed = "move";
    setDraggedProjectId(projectId);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (event: React.DragEvent, newStatus: ProjectStatus) => {
    event.preventDefault();
    if (!draggedProjectId) return;
    handleStatusSelect(draggedProjectId, newStatus);
    setDraggedProjectId(null);
  };

  const renderTable = () => (
    <div className="h-full overflow-auto p-8">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden min-w-[1000px]">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-bold text-gray-500">
            <tr>
              <th className="px-6 py-4">Client</th>
              <th className="px-6 py-4">Automation</th>
              <th className="px-6 py-4">Version</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Pricing</th>
              <th className="px-6 py-4">Owner</th>
              <th className="px-6 py-4">ETA</th>
              <th className="px-6 py-4">Last Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredProjects.map((project) => (
              <tr
                key={project.id}
                className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                onClick={() => router.push(`/admin/projects/${project.id}`)}
              >
                <td className="px-6 py-4 text-[#0A0A0A] font-medium flex items-center gap-2">
                  <Building2 size={14} className="text-gray-400" />
                  {project.clientName}
                </td>
                <td className="px-6 py-4">
                  <span className="font-bold text-[#0A0A0A]">{project.automationName}</span>
                  {project.type === "Revision" ? (
                    <Badge
                      variant="outline"
                      className="ml-2 text-[9px] border-blue-100 bg-blue-50 text-blue-600 px-1 py-0"
                    >
                      Rev
                    </Badge>
                  ) : null}
                </td>
                <td className="px-6 py-4">
                  <Badge
                    variant="outline"
                    className="font-mono text-xs bg-gray-50 border-gray-200 text-gray-600"
                  >
                    {project.versionLabel}
                  </Badge>
                </td>
                <td className="px-6 py-4">
                  <Select
                    value={project.status}
                    onValueChange={(value) => handleStatusSelect(project.id, value as ProjectStatus)}
                  >
                    <SelectTrigger
                      className={cn(
                        "h-7 text-xs font-medium border shadow-none w-auto gap-2 rounded-full px-3",
                        STATUS_STYLES[project.status]?.bg,
                        STATUS_STYLES[project.status]?.text,
                        STATUS_STYLES[project.status]?.border
                      )}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div
                        className={cn(
                          "w-1.5 h-1.5 rounded-full", STATUS_STYLES[project.status]?.dot
                        )}
                      />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_ORDER.map((status) => (
                        <SelectItem key={status} value={status}>
                          <div className="flex items-center gap-2">
                            <div className={cn("w-2 h-2 rounded-full", STATUS_STYLES[status]?.dot)} />
                            {status}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-6 py-4">
                  <Badge
                    variant="outline"
                    className={cn("font-medium border", PRICING_BADGE_STYLES[project.pricingStatus])}
                  >
                    {project.pricingStatus}
                  </Badge>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Avatar className="w-6 h-6 border border-gray-200">
                      <AvatarImage src={project.owner.avatar} />
                      <AvatarFallback className="text-[9px] bg-gray-100">
                        {project.owner.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-gray-600">{project.owner.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-xs font-mono text-gray-600">{project.eta}</td>
                <td className="px-6 py-4 text-xs text-gray-400">{project.lastUpdatedRelative}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderKanban = () => (
    <div className="h-full overflow-x-auto p-6">
      <div className="flex gap-4 min-w-max h-full">
        {STATUS_ORDER.map((status) => {
          const items = filteredProjects.filter((project) => project.status === status);
          const style = STATUS_STYLES[status];

          return (
            <div
              key={status}
              className="w-[280px] flex flex-col h-full rounded-xl"
              onDragOver={handleDragOver}
              onDrop={(event) => handleDrop(event, status)}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="font-bold text-xs text-[#0A0A0A] flex items-center gap-2 uppercase tracking-wide">
                  <div className={cn("w-2 h-2 rounded-full", style?.dot)} />
                  {status}
                </h3>
                <span className="text-[10px] font-bold text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded-md shadow-sm">
                  {items.length}
                </span>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto pb-4 px-1">
                {items.length === 0 ? (
                  <div className="h-24 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                    <p className="text-[10px] text-gray-400 font-medium">No projects</p>
                  </div>
                ) : (
                  items.map((project) => (
                    <div
                      key={project.id}
                      className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-pointer flex flex-col gap-3"
                      draggable
                      onDragStart={(event) => handleDragStart(event, project.id)}
                      onClick={() => router.push(`/admin/projects/${project.id}`)}
                    >
                      <div className="flex justify-between items-start">
                        <Link
                          href={`/admin/clients/${project.clientId}`}
                          className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#0A0A0A] transition-colors"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Building2 size={12} /> {project.clientName}
                        </Link>
                        {project.type === "Revision" ? (
                          <Badge
                            variant="outline"
                            className="text-[9px] border-blue-100 bg-blue-50 text-blue-600 px-1.5 py-0 rounded h-5"
                          >
                            REV
                          </Badge>
                        ) : null}
                      </div>
                      <div>
                        <h4 className="font-bold text-[#0A0A0A] text-sm leading-tight mb-1">
                          {project.automationName}
                        </h4>
                        <Badge
                          variant="outline"
                          className="bg-gray-50 border-gray-200 text-gray-500 font-mono text-[10px] px-1.5 py-0 rounded h-5"
                        >
                          {project.versionLabel}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <Avatar className="w-5 h-5 border border-gray-100">
                            <AvatarImage src={project.owner.avatar} />
                            <AvatarFallback className="text-[8px] bg-gray-50">
                              {project.owner.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-gray-600">{project.owner.name.split(" ")[0]}</span>
                        </div>
                        {project.eta !== "TBD" ? (
                          <span
                            className={cn(
                              "font-mono font-medium",
                              project.eta === "Today" ? "text-red-600" : "text-gray-400"
                            )}
                          >
                            Due {project.eta}
                          </span>
                        ) : null}
                      </div>
                      <div className="pt-3 mt-1 border-t border-gray-50 flex gap-2 flex-wrap">
                        <div
                          className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border",
                            project.pricingStatus === "Signed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                              : project.pricingStatus === "Sent"
                              ? "bg-purple-50 text-purple-700 border-purple-100"
                              : project.pricingStatus === "Draft"
                              ? "bg-amber-50 text-amber-700 border-amber-100"
                              : "bg-gray-50 text-gray-400 border-gray-100"
                          )}
                        >
                          <DollarSign size={10} />
                          {project.pricingStatus}
                        </div>
                        <div className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border bg-blue-50 text-blue-700 border-blue-100">
                          <CheckSquare size={10} />
                          {project.checklistProgress}%
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderEmptyState = () => (
    <Card className="border-dashed">
      <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center border border-gray-200">
          <MessageSquare size={20} className="text-gray-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-[#0A0A0A]">
            {isFiltered ? "No projects match your filters" : "No projects yet"}
          </h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            {isFiltered
              ? "Adjust your search or filters to see more work."
              : "Send an automation to pricing to create its project tracker."}
          </p>
        </div>
      </div>
    </Card>
  );

return (
    <>
      <div className="flex flex-col h-full bg-gray-50 text-[#1A1A1A] font-sans">
      <div className="bg-white border-b border-gray-200 px-8 py-5 shrink-0 z-10">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-[#0A0A0A]">Projects</h1>
              <p className="text-xs text-gray-500 mt-1">
                Managing {presentationProjects.length} active automations
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button className="bg-[#0A0A0A] text-white hover:bg-gray-800 gap-2" onClick={handleNewProject}>
                <span className="text-lg leading-none mb-0.5">+</span> New Project
              </Button>
              <Button variant="outline" onClick={fetchProjects} disabled={loading}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
              <div className="relative w-64 shrink-0">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <Input
                  placeholder="Search..."
                  className="pl-9 bg-gray-50 border-gray-200 focus:bg-white transition-colors h-9"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>

              <div className="h-6 w-px bg-gray-200" />

              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="w-[140px] h-9 border-gray-200 bg-white text-xs font-medium">
                  <SelectValue placeholder="Client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client} value={client}>
                      {client}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ProjectStatus | "all")}>
                <SelectTrigger className="w-[160px] h-9 border-gray-200 bg-white text-xs font-medium">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUS_ORDER.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as "all" | "New Automation" | "Revision")}>
                <SelectTrigger className="w-[140px] h-9 border-gray-200 bg-white text-xs font-medium">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {TYPE_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-[140px] h-9 border-gray-200 bg-white text-xs font-medium">
                  <SelectValue placeholder="Owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {owners.map((owner) => (
                    <SelectItem key={owner} value={owner}>
                      {owner}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={quoteFilter} onValueChange={(value) => setQuoteFilter(value as QuoteFilter)}>
                <SelectTrigger className="w-[150px] h-9 border-gray-200 bg-white text-xs font-medium">
                  <SelectValue placeholder="Quote" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All quotes</SelectItem>
                  <SelectItem value="NO_QUOTE">No quote</SelectItem>
                  {QUOTE_STATUS_FILTERS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {formatQuoteLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={buildFilter} onValueChange={(value) => setBuildFilter(value as AutomationLifecycleStatus | "ALL")}>
                <SelectTrigger className="w-[150px] h-9 border-gray-200 bg-white text-xs font-medium">
                  <SelectValue placeholder="Build" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All builds</SelectItem>
                  {BUILD_STATUS_FILTERS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex-1" />

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[150px] h-9 border-transparent bg-transparent hover:bg-gray-50 text-xs font-bold shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="eta">ETA</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="lastUpdated">Last Updated</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                className="shrink-0 bg-white border-gray-200"
                aria-label="Additional filters"
                onClick={() =>
                  toast({ title: "Advanced filters coming soon", description: "More controls will land here." })
                }
              >
                <Filter size={16} className="text-gray-500" />
              </Button>

              <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200 shrink-0">
                <button
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "p-1.5 rounded-md transition-all",
                    viewMode === "table" ? "bg-white text-[#E43632] shadow-sm" : "text-gray-400 hover:text-gray-600"
                  )}
                  aria-label="Table view"
                >
                  <ListIcon size={16} />
                </button>
                <button
                  onClick={() => setViewMode("kanban")}
                  className={cn(
                    "p-1.5 rounded-md transition-all",
                    viewMode === "kanban" ? "bg-white text-[#E43632] shadow-sm" : "text-gray-400 hover:text-gray-600"
                  )}
                  aria-label="Kanban view"
                >
                  <LayoutGrid size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 mt-4">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-hidden relative bg-gray-50/50">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : filteredProjects.length === 0 ? (
          renderEmptyState()
        ) : viewMode === "table" ? (
          renderTable()
        ) : (
          renderKanban()
        )}
      </div>
      </div>

      <Dialog open={statusModal.isOpen} onOpenChange={(open) => !open && closeStatusModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Project Status</DialogTitle>
            <DialogDescription>
              {statusModal.newStatus
                ? `Move this project to ${statusModal.newStatus}.`
                : "Choose a new status for this project."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="status-note" className="text-sm font-medium text-gray-700">
                Internal note
              </Label>
              <Textarea
                id="status-note"
                value={statusModal.note}
                onChange={(event) =>
                  setStatusModal((prev) => ({
                    ...prev,
                    note: event.target.value,
                  }))
                }
                placeholder="Add context for this change (visible to ops only)."
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[#0A0A0A]">Notify client</p>
                <p className="text-xs text-gray-500">Post an update to the project chat</p>
              </div>
              <Switch
                checked={statusModal.notifyClient}
                onCheckedChange={(checked) =>
                  setStatusModal((prev) => ({
                    ...prev,
                    notifyClient: checked,
                  }))
                }
              />
            </div>
            {statusModal.requireConfirmation ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>Live, blocked, and archived states require an audit note.</span>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeStatusModal}>
              Cancel
            </Button>
            <Button
              onClick={handleModalConfirm}
              disabled={statusModal.requireConfirmation && statusModal.note.trim().length === 0}
            >
              Update status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
