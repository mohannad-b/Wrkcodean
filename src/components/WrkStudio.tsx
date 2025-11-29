import React, { useState, useEffect, useCallback } from 'react';
import { 
  useNodesState, 
  useEdgesState, 
  addEdge, 
  Connection, 
  Edge, 
  Node,
  OnNodesChange,
  OnEdgesChange
} from 'reactflow';
import { StudioChat } from './StudioChat';
import { StudioCanvas } from './StudioCanvas';
import { StudioInspector } from './StudioInspector';
import { OverviewTab } from './OverviewTab';
import { ResultsTab } from './ResultsTab';
import { VersionsTab } from './VersionsTab';
import { ActivityTab } from './ActivityTab';
import { ContributorsTab } from './ContributorsTab';
import { AutomationSettings } from './AutomationSettings';
import { TasksView } from './TasksView';
import { TeamsView } from './TeamsView';
import { WorkspaceSettings } from './WorkspaceSettings';
import { UserSettings } from './UserSettings';
import { DashboardContent } from './DashboardContent';
import { AutomationsList } from './AutomationsList';
import { VersionSelector } from './VersionSelector';
import { BuildStatusTab } from './BuildStatusTab';
import { ClientBuildChat } from './ClientBuildChat';
import { CredentialsModal } from './CredentialsModal';
import { SystemPickerModal } from './SystemPickerModal';
import { ExceptionModal } from './ExceptionModal';
import { CreateAutomationModal } from './CreateAutomationModal';
import { InviteTeamModal } from './InviteTeamModal';
import { ConfirmationModal } from './ConfirmationModal';
import { CreateVersionModal } from './CreateVersionModal';
import { Sidebar } from './Sidebar';
import { OnboardingFlow } from './OnboardingFlow';
import { 
  Mail, 
  FileText, 
  Zap, 
  CheckSquare, 
  Split, 
  Bell,
  Construction,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { cn } from '../lib/utils';

// --- MOCK DATA FOR VERSIONS ---

// V1.0: Base Logic (> $5k)
const nodesV1_0: Node[] = [
  { id: '1', type: 'custom', position: { x: 400, y: 50 }, data: { title: 'New Invoice Email', icon: Mail, type: 'trigger', status: 'complete', description: 'Triggers when email arrives with "Invoice" in subject.' } },
  { id: '2', type: 'custom', position: { x: 400, y: 250 }, data: { title: 'Extract Details', icon: FileText, type: 'action', status: 'ai-suggested', description: 'AI extracts vendor, amount, and date from PDF.', isNew: true } },
  { id: '3', type: 'custom', position: { x: 400, y: 450 }, data: { title: 'Check Amount', icon: Split, type: 'logic', status: 'complete', description: 'Decision: Is amount > $5,000?' } },
  { id: '4', type: 'custom', position: { x: 200, y: 650 }, data: { title: 'Request Approval', icon: CheckSquare, type: 'human', status: 'warning', description: 'Assign task to Finance Manager for approval.' } },
  { id: '5', type: 'custom', position: { x: 600, y: 650 }, data: { title: 'Create Draft Bill', icon: Zap, type: 'action', status: 'complete', description: 'Create draft bill in Xero.' } },
  { id: '6', type: 'custom', position: { x: 400, y: 850 }, data: { title: 'Notify Slack', icon: Bell, type: 'action', status: 'complete', description: 'Send notification to #finance channel.' } },
];
const edgesV1_0: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
  { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
  { id: 'e3-4', source: '3', target: '4', type: 'condition', data: { label: '> $5k', operator: '>', value: 5000, unit: 'Dollars' } },
  { id: 'e3-5', source: '3', target: '5', type: 'condition', data: { label: '< $5k', operator: '<', value: 5000, unit: 'Dollars' } },
  { id: 'e4-6', source: '4', target: '6', type: 'smoothstep' },
  { id: 'e5-6', source: '5', target: '6', type: 'smoothstep' },
];

// V1.1: Revisions 1 (> $8k)
const nodesV1_1: Node[] = nodesV1_0.map(n => {
  if (n.id === '3') return { ...n, data: { ...n.data, description: 'Decision: Is amount > $8,000?' } };
  return n;
});
const edgesV1_1: Edge[] = edgesV1_0.map(e => {
  if (e.id === 'e3-4') return { ...e, data: { ...e.data, label: '> $8k', value: 8000 } };
  if (e.id === 'e3-5') return { ...e, data: { ...e.data, label: '< $8k', value: 8000 } };
  return e;
});

// V1.2: Revisions 2 (> $10k + Compliance Check)
const nodesV1_2: Node[] = [
  ...nodesV1_1.map(n => {
    if (n.id === '3') return { ...n, data: { ...n.data, description: 'Decision: Is amount > $10,000?' } };
    // Move Create Draft Bill and Notify Slack down to make room for new node
    if (n.id === '5') return { ...n, position: { x: 600, y: 850 } }; 
    if (n.id === '6') return { ...n, position: { x: 400, y: 1050 } };
    if (n.id === '4') return { ...n, position: { x: 200, y: 850 } };
    return n;
  }),
  // New Compliance Check Node inserted
  { id: '7', type: 'custom', position: { x: 600, y: 650 }, data: { title: 'Compliance Check', icon: ShieldCheck, type: 'action', status: 'complete', description: 'Run vendor against sanctions list.' } }
];
const edgesV1_2: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
  { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
  // Logic split
  { id: 'e3-4', source: '3', target: '4', type: 'condition', data: { label: '> $10k', operator: '>', value: 10000, unit: 'Dollars' } }, // To Approval
  { id: 'e3-7', source: '3', target: '7', type: 'condition', data: { label: '< $10k', operator: '<', value: 10000, unit: 'Dollars' } }, // To Compliance
  // Compliance flow
  { id: 'e7-5', source: '7', target: '5', type: 'smoothstep' }, // Compliance -> Draft Bill
  // Approval flow
  { id: 'e4-6', source: '4', target: '6', type: 'smoothstep' },
  { id: 'e5-6', source: '5', target: '6', type: 'smoothstep' },
];

const automationTabs = ['Overview', 'Build Status', 'Blueprint', 'Test', 'Activity', 'Contributors', 'Settings'];

const BLUEPRINT_CHECKLIST = [
  { id: 'overview', label: 'Overview', completed: true },
  { id: 'reqs', label: 'Business Requirements', completed: true },
  { id: 'objs', label: 'Business Objectives', completed: true },
  { id: 'criteria', label: 'Success Criteria', completed: true },
  { id: 'systems', label: 'Systems', completed: true },
  { id: 'data', label: 'Data Needs', completed: true },
  { id: 'exceptions', label: 'Exceptions', completed: true },
  { id: 'human', label: 'Human Touchpoints', completed: true },
  { id: 'flow', label: 'Flow Complete', completed: true },
];

export const WrkStudio: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(nodesV1_1);
  const [edges, setEdges, onEdgesChange] = useEdgesState(edgesV1_1);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [activeView, setActiveView] = useState('automations');
  const [activeTab, setActiveTab] = useState('Blueprint');
  const [selectedAutomationId, setSelectedAutomationId] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState('v1.1');

  // Modals State
  const [showSystemPicker, setShowSystemPicker] = useState(false);
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [activeSystem, setActiveSystem] = useState('');
  
  // New Modals State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: string, id?: string, title: string, desc: string, isDestructive?: boolean } | null>(null);
  
  // Contributor Mode Toggle
  const [isContributorMode, setIsContributorMode] = useState(false);
  
  // Sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);

  const handleEdgeLabelChange = useCallback((id: string, newLabel: string, newData: any) => {
    setEdges((eds) =>
      eds.map((edge) => {
        if (edge.id === id) {
          return {
            ...edge,
            data: { ...edge.data, ...newData, label: newLabel, onLabelChange: handleEdgeLabelChange }
          };
        }
        return edge;
      })
    );
  }, [setEdges]);

  // Switch versions logic
  useEffect(() => {
    let newNodes = nodesV1_1;
    let newEdges = edgesV1_1;

    if (currentVersion === 'v1.0') {
      newNodes = nodesV1_0;
      newEdges = edgesV1_0;
    } else if (currentVersion === 'v1.2') {
      newNodes = nodesV1_2;
      newEdges = edgesV1_2;
    }

    // Inject handlers
    const edgesWithHandlers = newEdges.map(e => ({
      ...e,
      data: {
        ...e.data,
        onLabelChange: handleEdgeLabelChange
      }
    }));

    setNodes(newNodes);
    setEdges(edgesWithHandlers);
    
    // Small animation effect
    setIsSynthesizing(true);
    setTimeout(() => setIsSynthesizing(false), 800);

  }, [currentVersion, handleEdgeLabelChange, setNodes, setEdges]);

  const handleAiCommand = (command: string) => {
     // Mock AI Logic for Condition Update
     if (command.toLowerCase().includes("10,000") || command.toLowerCase().includes("10k")) {
        setEdges((eds) => eds.map((e) => {
           if (e.id === 'e3-4') {
              return { 
                ...e, 
                selected: true, // Highlight
                data: { ...e.data, value: 10000, label: '> $10k', onLabelChange: handleEdgeLabelChange } 
              };
           }
           if (e.id === 'e3-5') {
              return { 
                ...e, 
                data: { ...e.data, value: 10000, label: '< $10k', onLabelChange: handleEdgeLabelChange } 
              };
           }
           return e;
        }));

        setTimeout(() => {
           setEdges((eds) => eds.map(e => ({ ...e, selected: false })));
        }, 2000);
     }
  };

  // Derived selected step data for inspector
  const selectedNode = nodes.find(n => n.id === selectedStepId);
  const selectedStepData = selectedNode ? {
    id: selectedNode.id,
    ...selectedNode.data,
    inputs: [], // Mock
    outputs: [] // Mock
  } : null;

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, type: 'default' }, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedStepId(node.id);
  }, []);

  // Modal Handlers
  const handleOpenSystemPicker = () => setShowSystemPicker(true);
  
  const handleSystemSelect = (system: string) => {
    setShowSystemPicker(false);
    setActiveSystem(system);
    setTimeout(() => setShowCredentialsModal(true), 200);
  };

  const handleOpenExceptionModal = () => setShowExceptionModal(true);

  const handleAddException = (rule: { condition: string, outcome: string }) => {
    if (!selectedStepId) return;

    setNodes((nds) => 
      nds.map((node) => {
        if (node.id === selectedStepId) {
          const existingExceptions = node.data.exceptions || [];
          return {
            ...node,
            data: {
              ...node.data,
              exceptions: [...existingExceptions, rule]
            }
          };
        }
        return node;
      })
    );
  };

  // New Modal Handlers
  const handleCreateAutomation = (data: any) => {
    console.log("Creating automation:", data);
    // In a real app, this would create the automation and then select it
    setSelectedAutomationId('new-id'); 
    // Reset version to default for new automation
    setCurrentVersion('v1.0');
  };

  const handleCreateVersion = (version: string) => {
    console.log("Creating version:", version);
    setCurrentVersion(version);
    // In real app, would copy current state to new version
  };

  const handleAction = (action: string, id: string) => {
    console.log("Action triggered:", action, id);
    if (action === 'archive') {
      setConfirmAction({
        type: 'archive',
        id,
        title: 'Archive Automation?',
        desc: 'This will stop all active runs. You can restore it later from the archive.',
        isDestructive: true
      });
      setShowConfirmModal(true);
    } else if (action === 'pause') {
      // Direct action or toast
    } else if (action === 'clone') {
      // Clone logic
    }
  };

  const handleConfirm = () => {
    if (confirmAction) {
      console.log("Confirmed action:", confirmAction.type);
      // Execute actual logic here
      setConfirmAction(null);
    }
  };

  return (
    <div className="flex h-[100dvh] w-full bg-white text-[#1A1A1A] overflow-hidden">
      
      {/* GLOBAL NAV (Sidebar) - Collapsible */}
      {!isContributorMode && (
        <div className={`shrink-0 z-30 hidden md:block transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'w-[48px]' : 'w-64'}`}>
           <Sidebar 
             collapsed={isSidebarCollapsed} 
             onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
             activeView={activeView}
             onNavigate={setActiveView}
           />
        </div>
      )}

      {/* CONTENT AREA */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50">
        {activeView === 'onboarding' ? (
          <OnboardingFlow onComplete={() => {
            // Create a new automation ID and select it
            const newId = 'new-auto-' + Date.now();
            // In a real app, we would add this to the list
            setSelectedAutomationId(newId);
            setActiveTab('Build Status');
            setActiveView('automations');
          }} />
        ) : activeView === 'automations' ? (
          !selectedAutomationId ? (
            <AutomationsList 
              onSelectAutomation={setSelectedAutomationId} 
              onCreateAutomation={() => setActiveView('onboarding')}
              onAction={handleAction}
            />
          ) : (
            <>
              {/* AUTOMATION HEADER (Breadcrumbs + Version) */}
              <div className="bg-white border-b border-gray-200 shrink-0 z-20 shadow-sm">
                {/* Line 1: Breadcrumbs */}
                <div className="h-10 flex items-center px-6 border-b border-gray-100">
                  <div className="text-xs font-medium text-gray-500 flex items-center gap-1">
                     <button 
                       onClick={() => setSelectedAutomationId(null)}
                       className="hover:text-[#0A0A0A] transition-colors"
                     >
                       Automations
                     </button>
                     <span className="text-gray-300">/</span>
                     <span className="text-[#0A0A0A] font-bold">Finance Reconciliation</span>
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
              {activeTab === 'Overview' ? (
                <OverviewTab 
                  onEditBlueprint={() => setActiveTab('Blueprint')} 
                  onInvite={() => setShowInviteModal(true)}
                />
              ) : activeTab === 'Build Status' ? (
                <BuildStatusTab />
              ) : activeTab === 'Blueprint' ? (
                /* STUDIO WORKSPACE */
                <div className="flex flex-col h-full w-full relative">
                  
                   {/* PROGRESS BAR (New) */}
                   <div className="h-14 border-b border-gray-100 bg-white flex items-center px-6 overflow-x-auto no-scrollbar shrink-0 z-20 relative">
                      <div className="flex items-center gap-6 min-w-max">
                         {BLUEPRINT_CHECKLIST.map((item) => (
                            <div key={item.id} className="flex items-center gap-2">
                               <div className={cn(
                                  "w-4 h-4 rounded-full border flex items-center justify-center transition-colors duration-500",
                                  item.completed ? "bg-[#E43632] border-[#E43632] text-white" : "border-gray-300 bg-white"
                               )}>
                                  {item.completed && <CheckCircle2 size={10} />}
                               </div>
                               <span className={cn(
                                  "text-xs font-medium transition-colors duration-500",
                                  item.completed ? "text-[#0A0A0A]" : "text-gray-400"
                               )}>{item.label}</span>
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
                    <div className={`shrink-0 h-full z-20 bg-white transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] border-l border-gray-200 shadow-xl ${
                      selectedStepId ? 'w-[420px] translate-x-0' : 'w-0 translate-x-full opacity-0'
                    }`}>
                      <StudioInspector 
                        selectedStep={selectedStepData} 
                        onClose={() => setSelectedStepId(null)}
                        onConnect={handleOpenSystemPicker}
                        onAddException={handleOpenExceptionModal}
                      />
                    </div>
                  </div>

                </div>
              ) : activeTab === 'Test' ? (
                <ResultsTab />
              ) : activeTab === 'Versions' ? (
                <VersionsTab />
              ) : activeTab === 'Activity' ? (
                <ActivityTab />
              ) : activeTab === 'Contributors' ? (
                <ContributorsTab />
              ) : activeTab === 'Settings' ? (
                <AutomationSettings />
              ) : (
                /* Placeholder for other tabs */
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <div className="w-16 h-16 bg-white border border-gray-100 rounded-full flex items-center justify-center mb-4 shadow-sm">
                    <Construction size={24} className="text-gray-300" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 capitalize mb-1">{activeTab}</h2>
                  <p className="text-sm text-gray-500">Manage {activeTab.toLowerCase()} for this automation here.</p>
                </div>
              )}
            </div>
          </>
          )
        ) : activeView === 'dashboard' ? (
          <DashboardContent 
            onCreateAutomation={() => setActiveView('onboarding')}
            onInvite={() => setShowInviteModal(true)}
            onStartOnboarding={() => setActiveView('onboarding')}
            onNavigate={setActiveView}
          />
        ) : activeView === 'tasks' ? (
          <TasksView />
        ) : activeView === 'messages' ? (
          <div className="h-full p-6 max-w-5xl mx-auto">
             <ClientBuildChat className="h-full" />
          </div>
        ) : activeView === 'workspace-settings' ? (
           <WorkspaceSettings defaultTab="profile" />
        ) : activeView === 'team' ? (
          <TeamsView />
        ) : activeView === 'user-settings' ? (
          <UserSettings />
        ) : (
          /* Placeholder for other global views (Dashboard, Tasks, etc) */
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 text-gray-400">
            <div className="w-16 h-16 bg-white border border-gray-100 rounded-full flex items-center justify-center mb-4 shadow-sm">
              <Construction size={32} className="text-gray-300" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 capitalize mb-2">{activeView}</h2>
            <p className="text-sm text-gray-500">This module is currently under development.</p>
          </div>
        )}
      </div>

      {/* GLOBAL MODALS */}
      <SystemPickerModal 
        isOpen={showSystemPicker}
        onClose={() => setShowSystemPicker(false)}
        onSelect={handleSystemSelect}
      />
      
      <CredentialsModal 
        isOpen={showCredentialsModal} 
        onClose={() => setShowCredentialsModal(false)} 
        systemName={activeSystem} 
      />

      <ExceptionModal 
        isOpen={showExceptionModal}
        onClose={() => setShowExceptionModal(false)}
        onAdd={handleAddException}
      />

      {/* New Modals */}
      <CreateAutomationModal 
        isOpen={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateAutomation}
      />
      
      <InviteTeamModal 
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />

      <CreateVersionModal 
        isOpen={showVersionModal}
        onClose={() => setShowVersionModal(false)}
        onCreate={handleCreateVersion}
        currentVersion={currentVersion}
      />

      <ConfirmationModal 
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirm}
        title={confirmAction?.title || 'Confirm Action'}
        description={confirmAction?.desc || 'Are you sure?'}
        isDestructive={confirmAction?.isDestructive}
      />

    </div>
  );
};
