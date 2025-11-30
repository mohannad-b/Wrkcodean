"use client";

import { useState } from "react";
import React from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  FileSignature,
  HelpCircle,
  Clock,
  X,
  ArrowRight,
  Zap,
  Key,
  Bot,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// --- Types & Mock Data ---

type TaskType = "approval" | "review" | "info" | "exception" | "version" | "access";
type Priority = "blocking" | "high" | "normal";

interface Task {
  id: string;
  type: TaskType;
  title: string;
  automationName: string;
  version: string;
  stepName?: string;
  priority: Priority;
  date: string;
  description: string;
  origin: "AI System" | "Sarah Chen" | "System Monitor";
  aiNote?: string;
}

const TASKS: Task[] = [
  {
    id: "t1",
    type: "version",
    title: "Sign Quote for Version 1.1",
    automationName: "Invoice Processing",
    version: "v1.1",
    priority: "blocking",
    date: "2 hours ago",
    description:
      "Version 1.1 adds 3 new steps and increases unit cost. Signature required to proceed with build.",
    origin: "AI System",
    aiNote: "This amendment includes the new OCR complexity charges discussed on Oct 24.",
  },
  {
    id: "t2",
    type: "exception",
    title: "Review Unclassified Invoice",
    automationName: "Invoice Processing",
    version: "v1.0",
    stepName: "Step 2: Extract Details",
    priority: "high",
    date: "Today, 9:41 AM",
    description:
      'The AI confidence score for "Vendor Name" was 42% (Threshold: 80%). Please manually verify.',
    origin: "System Monitor",
    aiNote: 'The invoice layout differs significantly from previous samples from "Acme Corp".',
  },
  {
    id: "t3",
    type: "access",
    title: "Reconnect Xero Integration",
    automationName: "Employee Onboarding",
    version: "v2.0",
    priority: "blocking",
    date: "Yesterday",
    description:
      "Authentication token for Xero has expired. Automations using this connection are paused.",
    origin: "System Monitor",
  },
  {
    id: "t4",
    type: "info",
    title: 'Clarify "Manager Approval" Logic',
    automationName: "Expense Reporting",
    version: "v1.2 (Draft)",
    stepName: "Step 4: Manager Logic",
    priority: "normal",
    date: "Oct 26",
    description:
      'You specified "Manager Approval" but did not define the threshold amount. Please update configuration.',
    origin: "AI System",
    aiNote: "Most similar automations use a $500 threshold for this step.",
  },
  {
    id: "t5",
    type: "review",
    title: "QA Sign-off for Release",
    automationName: "Lead Routing",
    version: "v3.1",
    priority: "normal",
    date: "Oct 25",
    description: "Automated tests passed. Please review the final output sample before deployment.",
    origin: "Sarah Chen",
  },
];

const FILTERS = [
  { id: "all", label: "All Tasks" },
  { id: "approval", label: "Approvals" },
  { id: "exception", label: "Exceptions" },
  { id: "info", label: "Missing Info" },
  { id: "access", label: "Access Issues" },
];

// --- Helper Components ---

const TaskIcon = ({ type }: { type: TaskType }) => {
  switch (type) {
    case "approval":
      return <FileSignature className="text-[#E43632]" />;
    case "version":
      return <FileSignature className="text-[#E43632]" />;
    case "exception":
      return <AlertTriangle className="text-amber-500" />;
    case "access":
      return <Key className="text-red-500" />;
    case "info":
      return <HelpCircle className="text-blue-500" />;
    case "review":
      return <CheckCircle2 className="text-emerald-500" />;
    default:
      return <Zap />;
  }
};

const PriorityBadge = ({ priority }: { priority: Priority }) => {
  switch (priority) {
    case "blocking":
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">Blocking</Badge>
      );
    case "high":
      return (
        <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">
          High Priority
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-gray-500 border-gray-200">
          Normal
        </Badge>
      );
  }
};

// --- Main Component ---

export function TasksView() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const filteredTasks = TASKS.filter((task) => {
    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "approval" && (task.type === "approval" || task.type === "version")) ||
      task.type === activeFilter;

    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.automationName.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const selectedTask = TASKS.find((t) => t.id === selectedTaskId);

  return (
    <div className="flex h-full bg-gray-50 relative overflow-hidden">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-6 pb-4 shrink-0 z-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-[#0A0A0A]">Tasks</h1>
              <p className="text-sm text-gray-500">Manage approvals, exceptions, and requests.</p>
            </div>
            <div className="relative w-64">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={16}
              />
              <Input
                placeholder="Search tasks..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border",
                  activeFilter === filter.id
                    ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-4">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                className={cn(
                  "bg-white rounded-xl border p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group relative",
                  selectedTaskId === task.id
                    ? "border-[#E43632] ring-1 ring-[#E43632]"
                    : "border-gray-200"
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                      "bg-gray-50 group-hover:bg-white transition-colors"
                    )}
                  >
                    <TaskIcon type={task.type} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-1">
                      <div>
                        <h3 className="font-bold text-[#0A0A0A] truncate">{task.title}</h3>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                          <span className="font-medium text-gray-900">{task.automationName}</span>
                          <span className="w-1 h-1 rounded-full bg-gray-300" />
                          <span>{task.version}</span>
                          {task.stepName && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-gray-300" />
                              <span className="truncate max-w-[150px]">{task.stepName}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <PriorityBadge priority={task.priority} />
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock size={12} /> {task.date}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute right-5 bottom-5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTaskId(task.id);
                    }}
                  >
                    Open
                  </Button>
                </div>
              </div>
            ))}

            {filteredTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <CheckCircle2 size={48} className="mb-4 text-gray-200" />
                <p>No tasks found matching your criteria.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slide-out Detail Panel */}
      <AnimatePresence>
        {selectedTask && (
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute top-0 right-0 h-full w-[450px] bg-white border-l border-gray-200 shadow-2xl z-30 flex flex-col"
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2 text-sm font-bold text-gray-500 uppercase tracking-wider">
                Task Details
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedTaskId(null)}>
                <X size={20} className="text-gray-400 hover:text-gray-900" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-8 space-y-8">
                {/* Title Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                      <TaskIcon type={selectedTask.type} />
                    </div>
                    <PriorityBadge priority={selectedTask.priority} />
                  </div>
                  <h2 className="text-2xl font-bold text-[#0A0A0A] leading-tight">
                    {selectedTask.title}
                  </h2>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">
                      Automation
                    </label>
                    <p className="text-sm font-bold text-[#0A0A0A]">
                      {selectedTask.automationName}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">
                      Version
                    </label>
                    <p className="text-sm font-bold text-[#0A0A0A]">{selectedTask.version}</p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">
                      Step
                    </label>
                    <p className="text-sm font-medium text-gray-600">
                      {selectedTask.stepName || "N/A"}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">
                      Requested By
                    </label>
                    <p className="text-sm font-medium text-gray-600 flex items-center gap-1">
                      {selectedTask.origin === "AI System" && <Bot size={14} />}
                      {selectedTask.origin}
                    </p>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <h3 className="text-sm font-bold text-[#0A0A0A] mb-2">Description</h3>
                  <p className="text-gray-600 leading-relaxed text-sm">
                    {selectedTask.description}
                  </p>
                </div>

                {/* AI Note */}
                {selectedTask.aiNote && (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
                    <Bot size={18} className="text-blue-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-blue-700">AI Insight</p>
                      <p className="text-xs text-blue-600 leading-relaxed">{selectedTask.aiNote}</p>
                    </div>
                  </div>
                )}

                {/* Blueprint Link */}
                <Button
                  variant="outline"
                  className="w-full justify-between border-gray-200 text-gray-700 h-12"
                  onClick={() => {
                    // Find automation by name and navigate to it
                    const automationId = "auto-1"; // Mock - in real app, lookup by automationName
                    router.push(`/automations/${automationId}?tab=Blueprint`);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Zap size={16} /> View in Blueprint
                  </span>
                  <ArrowRight size={16} className="text-gray-400" />
                </Button>
              </div>
            </ScrollArea>

            {/* Footer Actions */}
            <div className="p-6 border-t border-gray-200 bg-gray-50 shrink-0 space-y-3">
              {selectedTask.type === "approval" || selectedTask.type === "version" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" className="border-gray-200 text-gray-700">
                    Reject
                  </Button>
                  <Button className="bg-[#E43632] hover:bg-[#C12E2A] text-white shadow-lg shadow-red-500/20">
                    Review & Sign
                  </Button>
                </div>
              ) : selectedTask.type === "exception" ? (
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" className="border-gray-200 text-gray-700">
                    Ignore
                  </Button>
                  <Button className="bg-[#0A0A0A] hover:bg-gray-800 text-white">Resolve Now</Button>
                </div>
              ) : selectedTask.type === "access" ? (
                <Button className="w-full bg-[#0A0A0A] hover:bg-gray-800 text-white">
                  Reconnect System
                </Button>
              ) : (
                <Button className="w-full bg-[#0A0A0A] hover:bg-gray-800 text-white">
                  Mark as Complete
                </Button>
              )}

              <div className="text-center">
                <button className="text-xs text-gray-400 hover:text-gray-600 font-medium">
                  Snooze for 1 hour
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
