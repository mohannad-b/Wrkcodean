'use client';
import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Mail, 
  FileText, 
  Zap, 
  CheckSquare, 
  Split, 
  Bell,
  CheckCircle,
  MousePointer2
} from 'lucide-react';
import { Node, Edge } from 'reactflow';
import { StudioCanvas } from '../StudioCanvas';
import { HeroStudioChat } from './HeroStudioChat';
import { cn } from '../../lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';

// --- MOCK DATA ---
const nodesStart: Node[] = [];

const edgesStart: Edge[] = [];

const nodesFull: Node[] = [
  { id: '1', type: 'custom', position: { x: 400, y: 50 }, data: { title: 'New Invoice Email', icon: Mail, type: 'trigger', status: 'complete', description: 'Triggers when email arrives with "Invoice" in subject.' } },
  { id: '2', type: 'custom', position: { x: 400, y: 250 }, data: { title: 'Extract Details', icon: FileText, type: 'action', status: 'ai-suggested', description: 'AI extracts vendor, amount, and date from PDF.', isNew: true } },
  { id: '3', type: 'custom', position: { x: 400, y: 450 }, data: { title: 'Check Amount', icon: Split, type: 'logic', status: 'complete', description: 'Decision: Is amount > $5,000?' } },
  { id: '4', type: 'custom', position: { x: 200, y: 650 }, data: { title: 'Request Approval', icon: CheckSquare, type: 'human', status: 'warning', description: 'Assign task to Finance Manager for approval.' } },
  { id: '5', type: 'custom', position: { x: 600, y: 650 }, data: { title: 'Create Draft Bill', icon: Zap, type: 'action', status: 'complete', description: 'Create draft bill in Xero.' } },
  { id: '6', type: 'custom', position: { x: 400, y: 850 }, data: { title: 'Notify Slack', icon: Bell, type: 'action', status: 'complete', description: 'Send notification to #finance channel.' } },
];

const edgesFull: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
  { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
  { id: 'e3-4', source: '3', target: '4', type: 'condition', data: { label: '> $5k', operator: '>', value: 5000, unit: 'Dollars' } },
  { id: 'e3-5', source: '3', target: '5', type: 'condition', data: { label: '< $5k', operator: '<', value: 5000, unit: 'Dollars' } },
  { id: 'e4-6', source: '4', target: '6', type: 'smoothstep' },
  { id: 'e5-6', source: '5', target: '6', type: 'smoothstep' },
];

const messagesStart = [
  {
    id: '1',
    role: 'ai' as const,
    content: "I'm ready to help you build. What process are we automating today?",
    timestamp: '10:00 AM',
    suggestions: ["Invoice Processing", "Lead Routing", "Employee Onboarding"]
  },
  {
    id: '2',
    role: 'user' as const,
    content: "I want to automate my invoice approval process",
    timestamp: '10:01 AM'
  }
];

const messagesBuild = [
  ...messagesStart,
  {
    id: '3',
    role: 'ai' as const,
    content: "I drafted an invoice automation workflow....",
    timestamp: '10:01 AM',
    suggestions: ["Add Approval Step", "Refine Trigger", "Show in Canvas"]
  }
];

const WORKFLOW_CHECKLIST = [
  { id: 'overview', label: 'Overview', completed: true },
  { id: 'reqs', label: 'Business Requirements', completed: true },
  { id: 'objs', label: 'Business Objectives', completed: true },
  { id: 'criteria', label: 'Success Criteria', completed: true },
  { id: 'systems', label: 'Systems', completed: true },
  { id: 'data', label: 'Data Needs', completed: true },
  { id: 'exceptions', label: 'Exceptions', completed: true },
  { id: 'human', label: 'Human Touchpoints', completed: true },
];

interface HeroWorkflowProps {
  step: 1 | 2 | 3 | 4;
}

export const HeroWorkflow: React.FC<HeroWorkflowProps> = ({ step }) => {
  const [nodes, setNodes] = useState<Node[]>(nodesStart);
  const [edges, setEdges] = useState<Edge[]>(edgesStart);
  
  useEffect(() => {
    if (step === 1) {
       setNodes(nodesStart);
       setEdges(edgesStart);
       return;
    } else if (step === 2) {
       // Staggered build
       setNodes([]); // Start empty
       setEdges([]);
       
       const timeouts: NodeJS.Timeout[] = [];
       
       // Sequence
       nodesFull.forEach((node, index) => {
          const t = setTimeout(() => {
             setNodes(prev => {
                const exists = prev.find(n => n.id === node.id);
                if (exists) return prev;
                return [...prev, node];
             });
             
             setEdges(() => {
                // Add relevant edges
                // An edge is relevant if both source and target are visible (or will be visible after this update)
                // Since we are updating nodes, we can check against (index + 1) slice of nodesFull
                const visibleNodeIds = nodesFull.slice(0, index + 1).map(n => n.id);
                
                const newEdges = edgesFull.filter(e => 
                   visibleNodeIds.includes(e.source) && visibleNodeIds.includes(e.target)
                );
                
                return newEdges;
             });

          }, index * 600 + 200); // 200ms initial delay, then 600ms per node
          timeouts.push(t);
       });

       return () => timeouts.forEach(clearTimeout);
    } else {
       // Step 3/4: Show full immediately
       setNodes(nodesFull);
       setEdges(edgesFull);
       return;
    }
    return;
  }, [step]);
  
  const messages = useMemo(() => step === 1 ? messagesStart : messagesBuild, [step]);
  
  const checklist = useMemo(() => {
     if (step === 1 || step === 2) {
        return WORKFLOW_CHECKLIST.map(i => ({ ...i, completed: false }));
     }
     return WORKFLOW_CHECKLIST;
  }, [step]);

  return (
    <div className="flex flex-col h-full w-full bg-white relative overflow-hidden select-none pointer-events-none">
       
       {/* TOP BAR */}
       <div className="h-14 border-b border-gray-100 bg-white flex items-center px-6 justify-between shrink-0 z-20">
          {/* Checklist */}
          <div className="flex items-center gap-6 overflow-hidden">
             {checklist.map((item, _index) => (
                <div key={item.id} className="flex items-center gap-2 shrink-0">
                   <div className={cn(
                      "w-4 h-4 rounded-full border flex items-center justify-center transition-all duration-500",
                      item.completed ? "bg-[#E43632] border-[#E43632] text-white scale-100" : "border-gray-300 bg-white"
                   )}>
                      {item.completed && <CheckCircle size={10} />}
                   </div>
                   <span className={cn(
                      "text-xs font-medium transition-colors duration-500",
                      item.completed ? "text-[#0A0A0A]" : "text-gray-400"
                   )}>{item.label}</span>
                </div>
             ))}
          </div>
          
          {/* Step 3/4: Avatars */}
          {step >= 3 && (
             <div className="flex -space-x-2 animate-in fade-in slide-in-from-right-4 duration-500">
                <Avatar className="w-8 h-8 border-2 border-white shadow-sm">
                  <AvatarImage src="https://github.com/shadcn.png" />
                  <AvatarFallback>ME</AvatarFallback>
                </Avatar>
                <Avatar className="w-8 h-8 border-2 border-white shadow-sm">
                  <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">AB</AvatarFallback>
                </Avatar>
                <Avatar className="w-8 h-8 border-2 border-white shadow-sm">
                  <AvatarFallback className="bg-green-100 text-green-600 text-xs">Ops</AvatarFallback>
                </Avatar>
             </div>
          )}
       </div>

       <div className="flex-1 flex relative overflow-hidden">
          {/* LEFT PANEL: Chat */}
          <div className="w-[320px] shrink-0 z-20 h-full bg-[#F9FAFB] border-r border-gray-200 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
            <HeroStudioChat messages={messages} isThinking={step === 1} step={step} />
          </div>

          {/* CENTER: Canvas */}
          <div className="flex-1 relative h-full z-10 bg-gray-50">
            <StudioCanvas 
              nodes={nodes} 
              edges={edges}
              onNodesChange={() => {}}
              onEdgesChange={() => {}}
              onConnect={() => {}}
              onNodeClick={() => {}}
              isSynthesizing={false}
            />

            {/* Step 3: Dean Cursor */}
            {step === 3 && (
               <motion.div
                 className="absolute z-50 pointer-events-none"
                 initial={{ top: '10%', left: '50%' }}
                 animate={{
                   top: ['10%', '28%', '48%', '68%', '48%', '68%', '85%', '10%'],
                   left: ['50%', '50%', '50%', '35%', '50%', '65%', '50%', '50%']
                 }}
                 transition={{
                   duration: 10,
                   repeat: Infinity,
                   ease: "easeInOut",
                   times: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1]
                 }}
               >
                  <div className="relative">
                    <MousePointer2 className="text-[#E43632] fill-[#E43632] w-5 h-5" />
                    <div className="absolute top-4 left-3 bg-[#E43632] text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                      Dean
                    </div>
                  </div>
               </motion.div>
            )}
            
            {/* Step 4: Billing Card Overlay */}
            {step === 4 && (
               <div className="absolute bottom-6 right-6 w-80 bg-white border border-gray-200 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-bottom-8 duration-700 z-50 p-5">
                  <div className="flex items-center justify-between mb-4">
                     <h4 className="text-sm font-bold text-[#0A0A0A]">Billing Snapshot</h4>
                     <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full">This Month</span>
                  </div>
                  
                  <div className="space-y-3">
                     <div className="flex justify-between items-baseline">
                        <span className="text-xs text-gray-500">Successful tasks</span>
                        <span className="text-base font-bold text-[#0A0A0A]">18,420</span>
                     </div>
                     <div className="flex justify-between items-baseline">
                        <span className="text-xs text-gray-400">Failed / retried</span>
                        <span className="text-xs font-medium text-gray-400">73</span>
                     </div>
                     <div className="h-px bg-gray-100 my-2" />
                     <div className="flex justify-between items-baseline">
                        <span className="text-xs text-gray-500">Billed amount</span>
                        <span className="text-lg font-bold text-emerald-600">$921.00</span>
                     </div>
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-gray-50 flex items-center gap-2 text-emerald-600">
                     <CheckCircle size={14} />
                     <span className="text-[10px] font-semibold">Pay only per successful outcome</span>
                  </div>
               </div>
            )}
          </div>
       </div>
    </div>
  );
};
