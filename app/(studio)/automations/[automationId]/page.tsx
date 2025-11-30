"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { mockAutomations } from "@/lib/mock-automations";
import { notFound, useRouter } from "next/navigation";
import { VersionSelector } from "@/components/ui/VersionSelector";
import { OverviewTab } from "@/components/automations/OverviewTab";
import { BuildStatusTab } from "@/components/automations/BuildStatusTab";
import { TestTab } from "@/components/automations/TestTab";
import { ActivityTab } from "@/components/automations/ActivityTab";
import { ContributorsTab } from "@/components/automations/ContributorsTab";
import { SettingsTab } from "@/components/automations/SettingsTab";
import { StudioChat } from "@/components/automations/StudioChat";
import dynamic from "next/dynamic";
import { StudioInspector } from "@/components/automations/StudioInspector";

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
import { SystemPickerModal } from "@/components/modals/SystemPickerModal";
import { ExceptionModal } from "@/components/modals/ExceptionModal";
import { InviteTeamModal } from "@/components/modals/InviteTeamModal";
import { CreateVersionModal } from "@/components/modals/CreateVersionModal";
import { CredentialsModal } from "@/components/modals/CredentialsModal";
import { nodesV1_1, edgesV1_1 } from "@/lib/mock-blueprint";
import { useNodesState, useEdgesState, addEdge, Connection, Node } from "reactflow";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

interface AutomationDetailPageProps {
  params: {
    automationId: string;
  };
}

const automationTabs = [
  "Overview",
  "Build Status",
  "Blueprint",
  "Test",
  "Activity",
  "Contributors",
  "Settings",
];

const BLUEPRINT_CHECKLIST = [
  { id: "overview", label: "Overview", completed: true },
  { id: "reqs", label: "Business Requirements", completed: true },
  { id: "objs", label: "Business Objectives", completed: true },
  { id: "criteria", label: "Success Criteria", completed: true },
  { id: "systems", label: "Systems", completed: true },
  { id: "data", label: "Data Needs", completed: true },
  { id: "exceptions", label: "Exceptions", completed: true },
  { id: "human", label: "Human Touchpoints", completed: true },
  { id: "flow", label: "Flow Complete", completed: true },
];

export default function AutomationDetailPage({ params }: AutomationDetailPageProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("Overview");
  const [currentVersion, setCurrentVersion] = useState("v1.1");
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [isSynthesizing] = useState(false);
  const [isContributorMode, setIsContributorMode] = useState(false);
  const [showSystemPicker, setShowSystemPicker] = useState(false);
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [activeSystem, setActiveSystem] = useState<string>("");

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState(nodesV1_1);
  const [edges, setEdges, onEdgesChange] = useEdgesState(edgesV1_1);

  const automation = mockAutomations.find((a) => a.id === params.automationId);

  if (!automation) {
    notFound();
  }

  // Edge label change handler
  const handleEdgeLabelChange = useCallback(
    (
      id: string,
      newLabel: string,
      newData: { operator: string; value: string | number; unit: string }
    ) => {
      setEdges((eds) =>
        eds.map((edge) => {
          if (edge.id === id) {
            return {
              ...edge,
              data: {
                ...edge.data,
                ...newData,
                label: newLabel,
                onLabelChange: handleEdgeLabelChange,
              },
            };
          }
          return edge;
        })
      );
    },
    [setEdges]
  );

  // Inject handlers into edges
  useEffect(() => {
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        data: {
          ...e.data,
          onLabelChange: handleEdgeLabelChange,
        },
      }))
    );
  }, [handleEdgeLabelChange, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({ ...params, type: "default" }, eds));
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedStepId(node.id);
  }, []);

  // Track exceptions per step
  const [stepExceptions, setStepExceptions] = useState<
    Record<string, { condition: string; outcome: string }[]>
  >({});

  const handleAddException = (rule: { condition: string; outcome: string }) => {
    if (selectedStepId) {
      setStepExceptions((prev) => ({
        ...prev,
        [selectedStepId]: [...(prev[selectedStepId] || []), rule],
      }));
      // Update node data with exceptions
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === selectedStepId) {
            return {
              ...node,
              data: {
                ...node.data,
                exceptions: [...(stepExceptions[selectedStepId] || []), rule],
              },
            };
          }
          return node;
        })
      );
    }
  };

  // Derived selected step data for inspector
  const selectedNode = nodes.find((n) => n.id === selectedStepId);
  const selectedStepData = selectedNode
    ? {
        id: selectedNode.id,
        title: selectedNode.data.title || "",
        description: selectedNode.data.description || "",
        type: selectedNode.data.type || "action",
        status: selectedNode.data.status || "complete",
        inputs: [],
        outputs: [],
        exceptions:
          selectedStepId && stepExceptions[selectedStepId]
            ? stepExceptions[selectedStepId]
            : selectedNode.data.exceptions || [],
      }
    : null;

  const handleAiCommand = (command: string) => {
    // Mock AI Logic for Condition Update
    if (command.toLowerCase().includes("10,000") || command.toLowerCase().includes("10k")) {
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id === "e3-4") {
            return {
              ...e,
              selected: true,
              data: {
                ...e.data,
                value: 10000,
                label: "> $10k",
                onLabelChange: handleEdgeLabelChange,
              },
            };
          }
          if (e.id === "e3-5") {
            return {
              ...e,
              data: {
                ...e.data,
                value: 10000,
                label: "< $10k",
                onLabelChange: handleEdgeLabelChange,
              },
            };
          }
          return e;
        })
      );

      setTimeout(() => {
        setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
      }, 2000);
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-gray-50">
      {/* AUTOMATION HEADER (Breadcrumbs + Version) */}
      <div className="bg-white border-b border-gray-200 shrink-0 z-20 shadow-sm">
        {/* Line 1: Breadcrumbs */}
        <div className="h-10 flex items-center px-6 border-b border-gray-100">
          <div className="text-xs font-medium text-gray-500 flex items-center gap-1">
            <Link href="/automations" className="hover:text-[#0A0A0A] transition-colors">
              Automations
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-[#0A0A0A] font-bold">{automation.name}</span>
          </div>
        </div>

        {/* Line 2: Version & Tabs */}
        <div className="h-12 flex items-center px-6 justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-500">Version:</span>
            <VersionSelector
              currentVersion={currentVersion}
              onChange={setCurrentVersion}
              onNewVersion={() => setShowVersionModal(true)}
            />
          </div>

          <div className="flex h-full gap-1">
            {automationTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "relative h-full px-3 text-xs font-medium transition-colors flex items-center",
                  activeTab === tab
                    ? "text-[#E43632] bg-red-50/50 border-b-[2px] border-[#E43632]"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50 border-b-[2px] border-transparent"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TAB CONTENT */}
      <div className="flex-1 relative overflow-hidden">
        {activeTab === "Overview" ? (
          <OverviewTab
            onEditBlueprint={() => setActiveTab("Blueprint")}
            onInvite={() => setShowInviteModal(true)}
            onRunTest={() => setActiveTab("Test")}
            automationName={automation.name}
            automationDescription={automation.description}
            status={automation.status}
            version={automation.version}
          />
        ) : activeTab === "Build Status" ? (
          <BuildStatusTab version={currentVersion} />
        ) : activeTab === "Blueprint" ? (
          <div className="flex flex-col h-full w-full relative">
            {/* PROGRESS BAR */}
            <div className="h-14 border-b border-gray-100 bg-white flex items-center px-6 overflow-x-auto no-scrollbar shrink-0 z-20 relative">
              <div className="flex items-center gap-6 min-w-max">
                {BLUEPRINT_CHECKLIST.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full border flex items-center justify-center transition-colors duration-500",
                        item.completed
                          ? "bg-[#E43632] border-[#E43632] text-white"
                          : "border-gray-300 bg-white"
                      )}
                    >
                      {item.completed && <CheckCircle2 size={10} />}
                    </div>
                    <span
                      className={cn(
                        "text-xs font-medium transition-colors duration-500",
                        item.completed ? "text-[#0A0A0A]" : "text-gray-400"
                      )}
                    >
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 flex relative overflow-hidden">
              {/* LEFT PANEL: AI Chat */}
              <div className="w-[360px] shrink-0 z-20 h-full bg-[#F9FAFB] border-r border-gray-200 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                <StudioChat isContributorMode={isContributorMode} onAiCommand={handleAiCommand} />
              </div>

              {/* CENTER: Process Map Canvas */}
              <div className="flex-1 relative h-full z-10 bg-gray-50">
                <StudioCanvas
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={onNodeClick}
                  isSynthesizing={isSynthesizing}
                />

                {/* Debug Toggle for Contributor Mode (Bottom Left) */}
                <div className="absolute bottom-4 left-4 z-50">
                  <button
                    onClick={() => setIsContributorMode(!isContributorMode)}
                    className="text-[10px] text-gray-400 hover:text-[#E43632] bg-white/50 px-2 py-1 rounded border border-gray-200"
                  >
                    Toggle Contributor View
                  </button>
                </div>
              </div>

              {/* RIGHT PANEL: Inspector */}
              <div
                className={cn(
                  "shrink-0 h-full z-20 bg-white transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] border-l border-gray-200 shadow-xl",
                  selectedStepId ? "w-[420px] translate-x-0" : "w-0 translate-x-full opacity-0"
                )}
              >
                <StudioInspector
                  selectedStep={selectedStepData}
                  onClose={() => setSelectedStepId(null)}
                  onConnect={() => setShowSystemPicker(true)}
                  onAddException={() => setShowExceptionModal(true)}
                />
              </div>
            </div>
          </div>
        ) : activeTab === "Test" ? (
          <TestTab />
        ) : activeTab === "Activity" ? (
          <ActivityTab onNavigateToBlueprint={() => setActiveTab("Blueprint")} />
        ) : activeTab === "Contributors" ? (
          <ContributorsTab onInvite={() => setShowInviteModal(true)} />
        ) : activeTab === "Settings" ? (
          <SettingsTab
            onInviteUser={() => setShowInviteModal(true)}
            onAddSystem={() => setShowSystemPicker(true)}
            onNewVersion={() => setShowVersionModal(true)}
            onManageCredentials={(systemName) => {
              setActiveSystem(systemName);
              setShowCredentialsModal(true);
            }}
            onNavigateToTab={(tab) => setActiveTab(tab)}
            onNavigateToSettings={() => router.push("/workspace-settings")}
          />
        ) : null}
      </div>

      {/* MODALS */}
      <SystemPickerModal
        isOpen={showSystemPicker}
        onClose={() => setShowSystemPicker(false)}
        onSelect={(system) => {
          setActiveSystem(system);
          setShowSystemPicker(false);
          setShowCredentialsModal(true);
        }}
      />

      <ExceptionModal
        isOpen={showExceptionModal}
        onClose={() => setShowExceptionModal(false)}
        onAdd={handleAddException}
      />

      <InviteTeamModal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} />

      <CreateVersionModal
        isOpen={showVersionModal}
        onClose={() => setShowVersionModal(false)}
        onCreate={(version) => {
          setCurrentVersion(version);
          setShowVersionModal(false);
        }}
        currentVersion={currentVersion}
      />

      <CredentialsModal
        isOpen={showCredentialsModal}
        onClose={() => setShowCredentialsModal(false)}
        systemName={activeSystem}
      />
    </div>
  );
}
