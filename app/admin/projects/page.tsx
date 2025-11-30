"use client";

import { useState, useMemo } from "react";
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
import { Search as SearchIcon, LayoutGrid, List, Building2, CheckSquare, DollarSign, MessageSquare, AlertCircle } from "lucide-react";
import { mockAdminProjects, ProjectStatus, PricingStatus } from "@/lib/admin-mock";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

const STATUS_STYLES: Record<ProjectStatus, { bg: string; text: string; border: string; dot: string }> =
  {
    "Intake in Progress": {
      bg: "bg-gray-50",
      text: "text-gray-600",
      border: "border-gray-200",
      dot: "bg-gray-400",
    },
    "Needs Pricing": {
      bg: "bg-yellow-50",
      text: "text-yellow-700",
      border: "border-yellow-200",
      dot: "bg-yellow-500",
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

const PRICING_COLORS: Record<PricingStatus, string> = {
  "Not Generated": "text-gray-400 bg-gray-50 border-transparent",
  Draft: "text-amber-700 bg-amber-50 border-amber-200",
  Sent: "text-purple-700 bg-purple-50 border-purple-200",
  Signed: "text-emerald-700 bg-emerald-50 border-emerald-200",
};

export default function AdminProjectsPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"table" | "kanban">("kanban");
  const [projects, setProjects] = useState(mockAdminProjects);
  const [searchQuery, setSearchQuery] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("lastUpdated");

  // Status Change Modal State
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

  // Drag State
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);

  // Derived Data
  const filteredProjects = useMemo(() => {
    const result = projects.filter((p) => {
      const matchesSearch =
        p.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesClient = clientFilter === "all" || p.clientName === clientFilter;
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      const matchesType = typeFilter === "all" || p.type === typeFilter;
      const matchesOwner =
        ownerFilter === "all" ||
        (ownerFilter === "Unassigned"
          ? p.owner.name === "Unassigned"
          : p.owner.name.includes(ownerFilter));

      return matchesSearch && matchesClient && matchesStatus && matchesType && matchesOwner;
    });

    // Sorting logic
    result.sort((a, b) => {
      switch (sortBy) {
        case "status":
          return a.status.localeCompare(b.status);
        case "eta":
          if (a.eta === "TBD") return 1;
          if (b.eta === "TBD") return -1;
          return a.eta.localeCompare(b.eta);
        case "client":
          return a.clientName.localeCompare(b.clientName);
        case "owner":
          return a.owner.name.localeCompare(b.owner.name);
        case "lastUpdated":
        default:
          return b.lastUpdated.localeCompare(a.lastUpdated);
      }
    });

    return result;
  }, [projects, searchQuery, clientFilter, statusFilter, typeFilter, ownerFilter, sortBy]);

  // Unique lists for filters
  const clients = Array.from(new Set(projects.map((p) => p.clientName)));
  const owners = Array.from(new Set(projects.map((p) => p.owner.name))).filter(
    (n) => n !== "Unassigned"
  );

  // Handlers
  const initiateStatusChange = (projectId: string, newStatus: ProjectStatus) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project || project.status === newStatus) return;

    const sensitiveTransitions = ["Live", "Blocked", "Archived"];
    const needsConfirmation = sensitiveTransitions.includes(newStatus);

    if (needsConfirmation) {
      setStatusModal({
        isOpen: true,
        projectId,
        newStatus,
        note: "",
        notifyClient: false,
        requireConfirmation: true,
      });
    } else {
      // Immediate update for non-sensitive
      updateProjectStatus(projectId, newStatus);
    }
  };

  const updateProjectStatus = (projectId: string, newStatus: ProjectStatus) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId
          ? {
              ...p,
              status: newStatus,
              lastUpdated: new Date().toISOString(),
              lastUpdatedRelative: "Just now",
            }
          : p
      )
    );

    // Close modal if open
    setStatusModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleModalConfirm = () => {
    if (statusModal.projectId && statusModal.newStatus) {
      updateProjectStatus(statusModal.projectId, statusModal.newStatus);
    }
  };

  // Drag & Drop Handlers
  const handleDragStart = (e: React.DragEvent, projectId: string) => {
    e.dataTransfer.effectAllowed = "move";
    setDraggedProjectId(projectId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetStatus: ProjectStatus) => {
    e.preventDefault();
    if (draggedProjectId) {
      initiateStatusChange(draggedProjectId, targetStatus);
      setDraggedProjectId(null);
    }
  };

  const handleNewProject = () => {
    alert("New Project creation flow will be implemented here");
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 text-[#1A1A1A] font-sans">
      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 px-8 py-5 shrink-0 z-10">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[#0A0A0A]">Projects</h1>
              <p className="text-xs text-gray-500 mt-1">Managing {projects.length} active automations</p>
            </div>

            <div className="flex items-center gap-3">
              <Button className="bg-[#0A0A0A] text-white hover:bg-gray-800 gap-2" onClick={handleNewProject}>
                <span className="text-lg leading-none mb-0.5">+</span> New Project
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {/* Search & Filters Row */}
            <div className="flex items-center gap-3 overflow-x-auto pb-2 no-scrollbar">
              <div className="relative w-64 shrink-0">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <Input
                  placeholder="Search..."
                  className="pl-9 bg-gray-50 border-gray-200 focus:bg-white transition-colors h-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="h-6 w-px bg-gray-200 mx-2" />

              {/* Client Filter */}
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="w-[140px] h-9 border-gray-200 bg-white text-xs font-medium">
                  <SelectValue placeholder="Client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-9 border-gray-200 bg-white text-xs font-medium">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUS_ORDER.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Type Filter */}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px] h-9 border-gray-200 bg-white text-xs font-medium">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="New Automation">New Automation</SelectItem>
                  <SelectItem value="Revision">Revision</SelectItem>
                </SelectContent>
              </Select>

              {/* Owner Filter */}
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-[140px] h-9 border-gray-200 bg-white text-xs font-medium">
                  <SelectValue placeholder="Owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {owners.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                  <SelectItem value="Unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex-1" /> {/* Spacer */}

              {/* Sort Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Sort by:</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[130px] h-9 border-transparent bg-transparent hover:bg-gray-50 text-xs font-bold shadow-none">
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
              </div>

              {/* View Toggle */}
              <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200 shrink-0 ml-2">
                <button
                  onClick={() => setViewMode("table")}
                  className={cn(
                    "p-1.5 rounded-md transition-all",
                    viewMode === "table"
                      ? "bg-white text-[#E43632] shadow-sm"
                      : "text-gray-400 hover:text-gray-600"
                  )}
                  aria-label="Table view"
                  aria-pressed={viewMode === "table"}
                >
                  <List size={16} />
                </button>
                <button
                  onClick={() => setViewMode("kanban")}
                  className={cn(
                    "p-1.5 rounded-md transition-all",
                    viewMode === "kanban"
                      ? "bg-white text-[#E43632] shadow-sm"
                      : "text-gray-400 hover:text-gray-600"
                  )}
                  aria-label="Kanban view"
                  aria-pressed={viewMode === "kanban"}
                >
                  <LayoutGrid size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-hidden relative bg-gray-50/50">
        {/* TABLE VIEW */}
        {viewMode === "table" && (
          <div className="h-full overflow-auto p-8">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden min-w-[1000px]">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-bold text-gray-500">
                  <tr>
                    <th className="px-6 py-4 font-bold">Client</th>
                    <th className="px-6 py-4 font-bold">Automation</th>
                    <th className="px-6 py-4 font-bold">Version</th>
                    <th className="px-6 py-4 font-bold">Status</th>
                    <th className="px-6 py-4 font-bold">Pricing Status</th>
                    <th className="px-6 py-4 font-bold">Internal Owner</th>
                    <th className="px-6 py-4 font-bold">ETA</th>
                    <th className="px-6 py-4 font-bold">Last Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProjects.map((p) => (
                    <tr
                      key={p.id}
                      onClick={(e) => {
                        // Prevent navigation if clicking status dropdown
                        if (!(e.target as HTMLElement).closest(".status-dropdown")) {
                          router.push(`/admin/projects/${p.id}`);
                        }
                      }}
                      className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 font-medium text-[#0A0A0A]">
                          <Building2 size={14} className="text-gray-400" />
                          {p.clientName}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-[#0A0A0A]">{p.name}</span>
                        {p.type === "Revision" && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-[9px] border-blue-100 bg-blue-50 text-blue-600 px-1 py-0"
                          >
                            Rev
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                          {p.version}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="status-dropdown" onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={p.status}
                            onValueChange={(val) => initiateStatusChange(p.id, val as ProjectStatus)}
                          >
                            <SelectTrigger
                              className={cn(
                                "h-7 text-xs font-medium border shadow-none w-auto gap-2 rounded-full px-3",
                                STATUS_STYLES[p.status].bg,
                                STATUS_STYLES[p.status].text,
                                STATUS_STYLES[p.status].border
                              )}
                            >
                              <div className={cn("w-1.5 h-1.5 rounded-full", STATUS_STYLES[p.status].dot)} />
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_ORDER.map((s) => (
                                <SelectItem key={s} value={s}>
                                  <div className="flex items-center gap-2">
                                    <div className={cn("w-2 h-2 rounded-full", STATUS_STYLES[s].dot)} />
                                    {s}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant="outline"
                          className={cn("font-medium border shadow-none", PRICING_COLORS[p.pricingStatus])}
                        >
                          {p.pricingStatus}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6 border border-gray-200">
                            <AvatarImage src={p.owner.avatar} />
                            <AvatarFallback className="text-[9px] bg-gray-100">
                              {p.owner.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-gray-600">{p.owner.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono font-medium text-gray-600">{p.eta}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-gray-400">{p.lastUpdatedRelative}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredProjects.length === 0 && (
                <div className="p-12 text-center text-gray-400">
                  No projects found matching your filters.
                </div>
              )}
            </div>
          </div>
        )}

        {/* KANBAN VIEW */}
        {viewMode === "kanban" && (
          <div className="h-full overflow-x-auto p-6">
            <div className="flex gap-4 min-w-max h-full">
              {STATUS_ORDER.map((status) => {
                const items = filteredProjects.filter((p) => p.status === status);
                const style = STATUS_STYLES[status];

                return (
                  <div
                    key={status}
                    className="w-[280px] flex flex-col h-full rounded-xl transition-colors duration-200"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, status)}
                  >
                    {/* Column Header */}
                    <div className="flex items-center justify-between mb-3 px-1">
                      <h3 className="font-bold text-xs text-[#0A0A0A] flex items-center gap-2 uppercase tracking-wide">
                        <div className={cn("w-2 h-2 rounded-full", style.dot)} />
                        {status}
                      </h3>
                      <span className="text-[10px] font-bold text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded-md shadow-sm">
                        {items.length}
                      </span>
                    </div>

                    <div className="flex-1 space-y-3 overflow-y-auto pb-4 px-1">
                      {items.map((p) => (
                        <div
                          key={p.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, p.id)}
                          onClick={() => router.push(`/admin/projects/${p.id}`)}
                          className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group relative flex flex-col gap-3 active:cursor-grabbing active:scale-[0.98]"
                        >
                          {/* Header */}
                          <div className="flex justify-between items-start">
                            <Link
                              href={`/admin/clients/${p.clientId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#0A0A0A] transition-colors"
                            >
                              <Building2 size={12} /> {p.clientName}
                            </Link>
                            {p.type === "Revision" && (
                              <Badge
                                variant="outline"
                                className="text-[9px] border-blue-100 bg-blue-50 text-blue-600 px-1.5 py-0 rounded h-5"
                              >
                                REV
                              </Badge>
                            )}
                          </div>

                          {/* Title & Version */}
                          <div>
                            <h4 className="font-bold text-[#0A0A0A] text-sm leading-tight mb-1">{p.name}</h4>
                            <Badge
                              variant="outline"
                              className="bg-gray-50 border-gray-200 text-gray-500 font-mono text-[10px] px-1.5 py-0 rounded h-5"
                            >
                              {p.version}
                            </Badge>
                          </div>

                          {/* Owner & ETA */}
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <Avatar className="w-5 h-5 border border-gray-100">
                                <AvatarImage src={p.owner.avatar} />
                                <AvatarFallback className="text-[8px] bg-gray-50">
                                  {p.owner.name.charAt(0)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-gray-600">{p.owner.name.split(" ")[0]}</span>
                            </div>
                            {p.eta !== "TBD" && (
                              <span
                                className={cn(
                                  "font-mono font-medium",
                                  p.eta === "Today" ? "text-red-600" : "text-gray-400"
                                )}
                              >
                                Due {p.eta}
                              </span>
                            )}
                          </div>

                          {/* Status Chips (Pricing + Checklist) */}
                          <div className="pt-3 mt-1 border-t border-gray-50 flex gap-2">
                            <div
                              className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border",
                                p.pricingStatus === "Signed"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                  : p.pricingStatus === "Sent"
                                  ? "bg-purple-50 text-purple-700 border-purple-100"
                                  : p.pricingStatus === "Draft"
                                  ? "bg-amber-50 text-amber-700 border-amber-100"
                                  : "bg-gray-50 text-gray-400 border-gray-100"
                              )}
                            >
                              <DollarSign size={10} />
                              {p.pricingStatus === "Not Generated" ? "No Price" : p.pricingStatus}
                            </div>

                            <div
                              className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border",
                                p.checklistProgress === 100
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                  : "bg-blue-50 text-blue-700 border-blue-100"
                              )}
                            >
                              <CheckSquare size={10} />
                              {p.checklistProgress}%
                            </div>
                          </div>
                        </div>
                      ))}
                      {items.length === 0 && (
                        <div className="h-24 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                          <p className="text-[10px] text-gray-400 font-medium">No projects</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* STATUS CHANGE CONFIRMATION MODAL */}
      <Dialog
        open={statusModal.isOpen}
        onOpenChange={(open) => !open && setStatusModal((prev) => ({ ...prev, isOpen: false }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Project Status</DialogTitle>
            <DialogDescription>
              You are moving this project to{" "}
              <span className="font-bold text-[#0A0A0A]">{statusModal.newStatus}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-6">
            <div className="space-y-2">
              <Label>Internal Note</Label>
              <Textarea
                placeholder="Add a reason for this status change..."
                value={statusModal.note}
                onChange={(e) => setStatusModal((prev) => ({ ...prev, note: e.target.value }))}
              />
            </div>

            <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-md">
                  <MessageSquare size={16} />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#0A0A0A]">Notify Client</p>
                  <p className="text-xs text-gray-500">Post update to project chat</p>
                </div>
              </div>
              <Switch
                checked={statusModal.notifyClient}
                onCheckedChange={(checked) =>
                  setStatusModal((prev) => ({ ...prev, notifyClient: checked }))
                }
              />
            </div>

            {statusModal.newStatus === "Blocked" && (
              <div className="flex gap-2 items-start p-3 bg-red-50 text-red-800 text-xs rounded-lg">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p>Marking as blocked will flag this project for immediate management review.</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStatusModal((prev) => ({ ...prev, isOpen: false }))}
            >
              Cancel
            </Button>
            <Button
              onClick={handleModalConfirm}
              disabled={statusModal.newStatus === "Blocked" && !statusModal.note}
              className="bg-[#E43632] text-white hover:bg-[#C12E2A]"
            >
              Update Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
