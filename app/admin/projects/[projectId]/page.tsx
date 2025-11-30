"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CheckCircle2, AlertTriangle, GitBranch, FileText, ShieldAlert } from "lucide-react";
import { mockAdminProjects, mockProjectMessages, AdminProject } from "@/lib/admin-mock";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { PricingOverridePanel } from "@/components/admin/PricingOverridePanel";
import { ConversationThread } from "@/components/admin/ConversationThread";
import dynamic from "next/dynamic";
import { useNodesState, useEdgesState } from "reactflow";

// Dynamically import StudioCanvas to reduce initial bundle size
// ReactFlow is heavy (~200KB), so we only load it when the Blueprint tab is active
const StudioCanvas = dynamic(
  () => import("@/components/automations/StudioCanvas").then((mod) => ({ default: mod.StudioCanvas })),
  {
    loading: () => (
      <div className="w-full h-full flex items-center justify-center bg-[#F9FAFB]">
        <div className="text-sm text-gray-500">Loading canvas...</div>
      </div>
    ),
    ssr: false, // ReactFlow requires client-side only
  }
);
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";

interface ProjectDetailPageProps {
  params: {
    projectId: string;
  };
}

// Overview Tab Component
function OverviewTab({ project }: { project: AdminProject }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 h-full overflow-y-auto">
      {/* Summary Card */}
      <Card className="lg:col-span-2 p-6 space-y-6">
        <div className="flex justify-between items-start">
          <h3 className="font-bold text-lg text-[#0A0A0A]">Version Summary</h3>
          {project.type === "Revision" && (
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              <GitBranch size={12} className="mr-1" /> Revision
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-gray-500 uppercase font-bold">Description</p>
            <p className="text-sm text-gray-700 leading-relaxed">
              {project.description || "No description provided"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-gray-500 uppercase font-bold">Systems Involved</p>
            <div className="flex flex-wrap gap-2">
              {project.systems && project.systems.length > 0 ? (
                project.systems.map((s) => (
                  <Badge key={s} variant="secondary" className="bg-gray-100 text-gray-600">
                    {s}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-gray-400">No systems defined</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-500 uppercase font-bold mb-1">Risk Level</p>
            <Badge
              className={cn(
                "border-none",
                project.risk === "Low"
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                  : project.risk === "Medium"
                  ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                  : "bg-red-100 text-red-700 hover:bg-red-100"
              )}
            >
              {project.risk || "Not Set"} Risk
            </Badge>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-bold mb-1">Complexity</p>
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-none">
              Medium
            </Badge>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-bold mb-1">Est. Build Time</p>
            <p className="text-sm font-bold text-gray-700">3 Days</p>
          </div>
        </div>
      </Card>

      {/* Checklist Card */}
      <Card className="lg:col-span-1 p-6 flex flex-col h-full">
        <h3 className="font-bold text-lg text-[#0A0A0A] mb-4">Requirements Checklist</h3>

        {project.checklistProgress < 100 && (
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4 flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-800">In Progress</p>
              <p className="text-[10px] text-amber-700">
                {100 - project.checklistProgress}% remaining
              </p>
            </div>
          </div>
        )}

        <div className="space-y-3 flex-1">
          {[
            "Overview",
            "Business Requirements",
            "Business Objectives",
            "Success Criteria",
            "Systems",
            "Data Needs",
            "Exceptions",
            "Human Touchpoints",
            "Flow",
          ].map((item, i) => {
            const isComplete = i < (project.checklistProgress / 100) * 9;
            return (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className={cn("text-gray-600", !isComplete && "text-amber-600 font-medium")}>
                  {item}
                </span>
                {isComplete ? (
                  <CheckCircle2 size={16} className="text-emerald-500" />
                ) : (
                  <AlertTriangle size={16} className="text-amber-500" />
                )}
              </div>
            );
          })}
        </div>

        <Button variant="outline" className="mt-4 w-full border-gray-200 text-gray-600 hover:text-[#0A0A0A]">
          View Full Requirements
        </Button>
      </Card>
    </div>
  );
}

// Blueprint Tab Component
function BlueprintTab() {
  const [nodes, , onNodesChange] = useNodesState([
    {
      id: "1",
      type: "custom",
      position: { x: 250, y: 50 },
      data: { title: "Invoice Email", icon: FileText, type: "trigger", status: "complete" },
    },
    {
      id: "2",
      type: "custom",
      position: { x: 250, y: 200 },
      data: { title: "Extract Data", icon: FileText, type: "action", status: "complete" },
    },
    {
      id: "3",
      type: "custom",
      position: { x: 250, y: 350 },
      data: {
        title: "Sanctions Check",
        icon: ShieldAlert,
        type: "action",
        status: "warning",
        description: "Needs API Key",
      },
    },
  ]);
  const [edges, , onEdgesChange] = useEdgesState([
    { id: "e1-2", source: "1", target: "2" },
    { id: "e2-3", source: "2", target: "3" },
  ]);

  const mockIntakeChat = [
    { role: "user", text: "We need to add a check for high value invoices.", time: "2d ago" },
    { role: "ai", text: "Understood. What is the threshold?", time: "2d ago" },
    { role: "user", text: "$10,000. Also check the vendor name against a sanctions list.", time: "2d ago" },
  ];

  const mockFiles = ["Sanctions_List_API_Docs.pdf", "Updated_SOP_v2.docx"];

  return (
    <div className="flex h-full border-t border-gray-200">
      {/* Left: Intake Context */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100 font-bold text-sm text-gray-700">
          Client Intake
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {mockIntakeChat.map((msg, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] text-gray-400 uppercase font-bold">
                  <span>{msg.role}</span>
                  <span>{msg.time}</span>
                </div>
                <div
                  className={cn(
                    "p-3 rounded-lg text-xs leading-relaxed",
                    msg.role === "user"
                      ? "bg-gray-100 text-gray-800"
                      : "bg-blue-50 text-blue-800"
                  )}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase mb-3">Attached Files</p>
            <div className="space-y-2">
              {mockFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded border border-gray-200 bg-gray-50 hover:bg-white cursor-pointer transition-colors"
                >
                  <FileText size={14} className="text-gray-400" />
                  <span className="text-xs font-medium text-gray-700 truncate">{f}</span>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Center: Canvas */}
      <div className="flex-1 bg-gray-50 relative">
        <StudioCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={() => {}}
          onNodeClick={() => {}}
          isSynthesizing={false}
        />
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur p-2 rounded-lg shadow-sm border border-gray-200 text-xs text-gray-500">
          Ops Edit Mode
        </div>
      </div>

      {/* Right: Internal Notes */}
      <div className="w-80 border-l border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <span className="font-bold text-sm text-gray-700">Internal Notes</span>
          <Button size="sm" variant="ghost" className="h-6 px-2">
            <span className="text-lg">+</span>
          </Button>
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            <div className="p-3 border border-amber-100 bg-amber-50 rounded-lg">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-xs mb-1">
                <ShieldAlert size={12} /> Compliance Check
              </div>
              <p className="text-xs text-amber-900">
                Needs verification of the Sanctions API rate limits. We might need to cache results.
              </p>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

// Tasks Tab Component
function TasksTab() {
  const tasks = {
    backlog: [{ id: 1, title: "Configure Webhook Listener", assignee: "Mike R.", due: "Nov 14" }],
    in_progress: [
      { id: 2, title: "Implement Sanctions API", assignee: "Mike R.", due: "Nov 12" },
      { id: 3, title: "Update Email Template", assignee: "Sarah C.", due: "Nov 12" },
    ],
    qa: [],
    done: [{ id: 4, title: "Refactor Logic Node", assignee: "Mike R.", due: "Nov 10" }],
  };

  return (
    <div className="p-6 h-full overflow-x-auto bg-gray-50">
      <div className="flex gap-6 h-full min-w-[1000px]">
        {[
          { id: "backlog", label: "Backlog", items: tasks.backlog, color: "bg-gray-200" },
          { id: "in_progress", label: "In Progress", items: tasks.in_progress, color: "bg-blue-500" },
          { id: "qa", label: "QA", items: tasks.qa, color: "bg-pink-500" },
          { id: "done", label: "Done", items: tasks.done, color: "bg-emerald-500" },
        ].map((col) => (
          <div key={col.id} className="w-[300px] flex flex-col h-full">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", col.color)} />
                <h3 className="font-bold text-sm text-gray-700">{col.label}</h3>
                <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                  {col.items.length}
                </span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <span className="text-lg">+</span>
              </Button>
            </div>

            <div className="flex-1 bg-gray-200/50 rounded-xl p-2 space-y-3 overflow-y-auto">
              {col.items.map((task) => (
                <Card key={task.id} className="p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-sm font-bold text-[#0A0A0A] leading-tight">{task.title}</p>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50">
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[9px] font-bold text-gray-600">
                        {task.assignee.charAt(0)}
                      </div>
                      <span className="text-[10px] text-gray-500">{task.assignee}</span>
                    </div>
                    <div
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded",
                        new Date(task.due) < new Date()
                          ? "bg-red-50 text-red-600"
                          : "bg-gray-50 text-gray-500"
                      )}
                    >
                      {task.due}
                    </div>
                  </div>
                </Card>
              ))}
              {col.id === "backlog" && (
                <Button variant="outline" className="w-full border-dashed border-gray-300 text-gray-500 text-xs h-9">
                  + Add Task
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Activity Tab Component
function ActivityTab() {
  const activityLog = [
    { id: 1, type: "internal", text: "Pricing draft generated by Mike Ross", time: "2h ago" },
    { id: 2, type: "client", text: "Client uploaded 'Updated_SOP_v2.docx'", time: "4h ago" },
    { id: 3, type: "system", text: "Blueprint v1.1 created from v1.0", time: "1d ago" },
  ];

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg text-[#0A0A0A]">Project Timeline</h3>
        <Button variant="outline" size="sm">
          <FileText size={14} className="mr-2" /> Export Log
        </Button>
      </div>

      <div className="relative border-l border-gray-200 ml-4 space-y-8">
        {activityLog.map((log) => (
          <div key={log.id} className="relative pl-8">
            <div
              className={cn(
                "absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm",
                log.type === "client"
                  ? "bg-blue-500"
                  : log.type === "internal"
                  ? "bg-gray-500"
                  : "bg-purple-500"
              )}
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-800">{log.text}</span>
              <span className="text-xs text-gray-400 mt-1">{log.time}</span>
            </div>
          </div>
        ))}
        <div className="relative pl-8">
          <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white bg-gray-200 shadow-sm" />
          <span className="text-sm text-gray-400 italic">Project Created (Oct 20)</span>
        </div>
      </div>
    </div>
  );
}

export default function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const project = mockAdminProjects.find((p) => p.id === params.projectId);
  const [activeTab, setActiveTab] = useState("overview");

  if (!project) {
    notFound();
  }

  const messages = mockProjectMessages[params.projectId] || [];
  const statusStyles: Record<string, { bg: string; text: string; border: string }> = {
    "Intake in Progress": { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" },
    "Needs Pricing": { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200" },
    "Awaiting Client Approval": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    "Build in Progress": { bg: "bg-red-50", text: "text-[#E43632]", border: "border-red-200" },
    "QA & Testing": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
    "Ready to Launch": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    Live: { bg: "bg-emerald-100", text: "text-emerald-800", border: "border-emerald-300" },
    Blocked: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
    Archived: { bg: "bg-gray-100", text: "text-gray-500", border: "border-gray-200" },
  };
  const statusStyle = statusStyles[project.status] || statusStyles["Intake in Progress"];

  return (
    <div className="flex flex-col h-full bg-gray-50 text-[#1A1A1A] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 shrink-0 z-20 shadow-sm">
        <div className="flex flex-col gap-4">
          {/* Breadcrumbs & Back */}
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Link href="/admin/projects" className="hover:text-[#0A0A0A] flex items-center gap-1 transition-colors">
              <ArrowLeft size={12} /> Projects
            </Link>
            <span>/</span>
            <span className="font-bold text-[#0A0A0A]">{project.clientName}</span>
            <span>/</span>
            <span className="font-bold text-[#0A0A0A]">{project.name}</span>
          </div>

          <div className="flex items-center justify-between">
            {/* Left: Title & Meta */}
            <div className="flex items-center gap-4">
              <Link 
                href={`/admin/clients/${project.clientId}`}
                className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200 text-gray-500 font-bold text-lg hover:bg-gray-200 transition-colors cursor-pointer"
                title={`View ${project.clientName} client details`}
              >
                {project.clientName.charAt(0)}
              </Link>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-2xl font-bold text-[#0A0A0A] leading-none">{project.name}</h1>
                  <Badge variant="outline" className="text-sm bg-blue-50 text-blue-700 border-blue-200 font-mono">
                    {project.version}
                  </Badge>
                  <Badge
                    className={cn(
                      "border font-medium px-2.5 py-0.5 rounded-full shadow-none",
                      statusStyle.bg,
                      statusStyle.text,
                      statusStyle.border
                    )}
                  >
                    {project.status}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 flex items-center gap-2">
                  <Link 
                    href={`/admin/clients/${project.clientId}`}
                    className="hover:text-[#0A0A0A] hover:underline transition-colors"
                  >
                    Client: <span className="font-bold">{project.clientName}</span>
                  </Link>
                  <span className="w-1 h-1 bg-gray-300 rounded-full" />
                  <span>
                    ETA: <span className="font-bold">{project.eta}</span>
                  </span>
                  <span className="w-1 h-1 bg-gray-300 rounded-full" />
                  <span>
                    Owner: <span className="font-bold">{project.owner.name}</span>
                  </span>
                </p>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex gap-3">
              <Button className="bg-[#0A0A0A] text-white hover:bg-gray-800">Save Changes</Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Row */}
      <div className="flex-1 flex overflow-hidden">
        {/* TABS AREA */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 border-b border-gray-200 bg-white shrink-0">
              <TabsList className="h-12 bg-transparent p-0 gap-8">
                {[
                  "Overview",
                  "Requirements & Blueprint",
                  "Pricing & Quote",
                  "Build Tasks",
                  "Activity",
                  "Chat",
                ].map((tab) => {
                  const value = tab.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-");
                  return (
                    <TabsTrigger
                      key={value}
                      value={value}
                      className={cn(
                        "h-full rounded-none border-b-2 bg-transparent px-0 text-sm font-medium text-gray-500 shadow-none transition-none data-[state=active]:border-[#E43632] data-[state=active]:text-[#E43632] data-[state=active]:shadow-none hover:text-gray-900"
                      )}
                    >
                      {tab}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            <div className="flex-1 bg-gray-50 overflow-hidden relative">
              <TabsContent value="overview" className="h-full m-0 data-[state=inactive]:hidden">
                <OverviewTab project={project} />
              </TabsContent>
              <TabsContent
                value="requirements-blueprint"
                className="h-full m-0 data-[state=inactive]:hidden"
              >
                <BlueprintTab />
              </TabsContent>
              <TabsContent value="pricing-quote" className="h-full m-0 data-[state=inactive]:hidden">
                <PricingOverridePanel project={project} />
              </TabsContent>
              <TabsContent value="build-tasks" className="h-full m-0 data-[state=inactive]:hidden">
                <TasksTab />
              </TabsContent>
              <TabsContent value="activity" className="h-full m-0 data-[state=inactive]:hidden">
                <ActivityTab />
              </TabsContent>
              <TabsContent value="chat" className="h-full m-0 data-[state=inactive]:hidden">
                <ConversationThread messages={messages} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
