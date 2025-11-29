import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  useNodesState, 
  useEdgesState, 
  Node, 
  Edge, 
  Connection, 
  addEdge 
} from 'reactflow';
import { Send, Paperclip, Mic, Monitor, CheckCircle2, ArrowRight, Zap, FileText, Split, Users, Globe, Bell, CheckSquare, MessageSquare, FileStack, Video, Image as ImageIcon, MousePointerClick } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { StudioCanvas } from './StudioCanvas';
import { StudioInspector } from './StudioInspector';

// --- TYPES ---
interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

const INITIAL_CHECKLIST: ChecklistItem[] = [
  { id: 'overview', label: 'Overview', completed: false },
  { id: 'reqs', label: 'Business Requirements', completed: false },
  { id: 'objs', label: 'Business Objectives', completed: false },
  { id: 'criteria', label: 'Success Criteria', completed: false },
  { id: 'systems', label: 'Systems', completed: false },
  { id: 'data', label: 'Data Needs', completed: false },
  { id: 'exceptions', label: 'Exceptions', completed: false },
  { id: 'human', label: 'Human Touchpoints', completed: false },
  { id: 'flow', label: 'Flow Complete', completed: false },
];

export const OnboardingIntake: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const [checklist, setChecklist] = useState(INITIAL_CHECKLIST);
  const [messages, setMessages] = useState<{role: 'ai'|'user', text: string}[]>([
     { role: 'ai', text: 'Hello! I\'m ready to help you build. Describe your process, or upload your requirements documents to get started.' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [status, setStatus] = useState<'empty' | 'building' | 'complete'>('empty');
  
  // ReactFlow State
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Node Click Handler
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedStepId(node.id);
  }, []);

  // Connector Handler
  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, type: 'default' }, eds));
  }, [setEdges]);

  // Derived selected step data for inspector
  const selectedNode = nodes.find(n => n.id === selectedStepId);
  const selectedStepData = selectedNode ? {
    id: selectedNode.id,
    ...selectedNode.data,
    inputs: [], 
    outputs: [] 
  } : null;

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const newMsg = { role: 'user' as const, text: inputValue };
    setMessages(prev => [...prev, newMsg]);
    setInputValue('');
    setStatus('building');
    setIsSynthesizing(true);

    // Simulation of AI building
    setTimeout(() => {
       const aiResponse = { role: 'ai' as const, text: "I've mapped out the initial flow based on your description. I've identified a trigger and two key actions. Does the approval step happen via Email or Slack?" };
       setMessages(prev => [...prev, aiResponse]);
       setIsSynthesizing(false);
       
       // Update Checklist - Check first batch
       setChecklist(prev => prev.map(item => 
          ['overview', 'reqs', 'systems', 'data'].includes(item.id) ? { ...item, completed: true } : item
       ));

       // Add Nodes & Edges
       const newNodes: Node[] = [
          { id: '1', type: 'custom', position: { x: 400, y: 50 }, data: { title: 'New Invoice', icon: Zap, type: 'trigger', status: 'complete', description: 'Triggers when email arrives with "Invoice" in subject.' } },
          { id: '2', type: 'custom', position: { x: 400, y: 250 }, data: { title: 'Extract Data', icon: FileText, type: 'action', status: 'ai-suggested', description: 'AI extracts vendor, amount, and date from PDF.', isNew: true } },
          { id: '3', type: 'custom', position: { x: 400, y: 450 }, data: { title: 'Check Amount', icon: Split, type: 'logic', status: 'complete', description: 'Decision: Is amount > $5,000?' } },
          { id: '4', type: 'custom', position: { x: 200, y: 650 }, data: { title: 'Approval', icon: Users, type: 'human', status: 'warning', description: 'Assign task to Manager.' } },
          { id: '5', type: 'custom', position: { x: 600, y: 650 }, data: { title: 'Create Bill', icon: Globe, type: 'action', status: 'complete', description: 'Create draft bill in Xero.' } },
       ];

       const newEdges: Edge[] = [
          { id: 'e1-2', source: '1', target: '2', type: 'smoothstep' },
          { id: 'e2-3', source: '2', target: '3', type: 'smoothstep' },
          { id: 'e3-4', source: '3', target: '4', type: 'condition', data: { label: '> $5k', operator: '>', value: 5000 } },
          { id: 'e3-5', source: '3', target: '5', type: 'condition', data: { label: '< $5k', operator: '<', value: 5000 } },
       ];

       setNodes(newNodes);
       setEdges(newEdges);

       // Simulate interacting with AI again to complete checklist
       setTimeout(() => {
         setChecklist(prev => prev.map(item => ({ ...item, completed: true })));
         setStatus('complete');
       }, 5000);

    }, 1500);
  };

  const handleComplete = () => {
     // Force completion for demo
     setChecklist(prev => prev.map(item => ({ ...item, completed: true })));
     setStatus('complete');
     setIsSynthesizing(false);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      
      {/* TOP: PROGRESS BAR */}
      <div className="h-14 border-b border-gray-100 bg-white flex items-center px-6 overflow-x-auto no-scrollbar shrink-0 z-20 relative">
        <div className="flex items-center gap-6 min-w-max">
           {checklist.map((item) => (
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

      {/* BLUEPRINT CONFIRMATION BANNER */}
      {status === 'complete' && (
        <div 
            className="bg-[#0A0A0A] text-white shrink-0 overflow-hidden z-50 animate-in slide-in-from-top-10 fade-in duration-500"
        >
            <div className="px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-black">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Blueprint Complete</p>
                    <p className="text-xs text-gray-400">Review the flow below and proceed when ready.</p>
                  </div>
              </div>
              <div className="flex items-center gap-3">
                  <Button onClick={onNext} className="bg-[#E43632] hover:bg-[#C12E2A] text-white font-bold h-9 text-xs">
                    Proceed to Build <ArrowRight size={14} className="ml-2" />
                  </Button>
              </div>
            </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
         
         {/* LEFT: CHAT */}
         <div className="w-[350px] flex flex-col border-r border-gray-200 bg-white z-30 shadow-lg">
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
               <div className="space-y-4 pb-4">
                  {messages.map((m, i) => (
                     <div key={i} className={cn("flex gap-3", m.role === 'user' ? "flex-row-reverse" : "")}>
                        <Avatar className="w-8 h-8 shrink-0 border border-gray-100">
                           <AvatarFallback className={m.role === 'ai' ? "bg-[#E43632] text-white" : "bg-[#0A0A0A] text-white"}>
                              {m.role === 'ai' ? "AI" : "ME"}
                           </AvatarFallback>
                        </Avatar>
                        <div className={cn(
                           "p-3 rounded-2xl text-sm max-w-[85%]",
                           m.role === 'user' ? "bg-[#0A0A0A] text-white rounded-tr-none" : "bg-gray-50 text-gray-800 rounded-tl-none border border-gray-100"
                        )}>
                           {m.text}
                        </div>
                     </div>
                  ))}
               </div>
            </ScrollArea>
            
            <div className="p-4 border-t border-gray-100 bg-white space-y-3">
               {status !== 'complete' && (
                   <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 text-[10px] h-7"><Paperclip size={12} className="mr-1"/> File</Button>
                      <Button variant="outline" size="sm" className="flex-1 text-[10px] h-7"><Monitor size={12} className="mr-1"/> Record</Button>
                   </div>
               )}
               <div className="relative">
                  <Input 
                     value={inputValue}
                     onChange={(e) => setInputValue(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                     placeholder="Type details..." 
                     className="pr-10"
                     disabled={status === 'complete'}
                  />
                  <Button size="icon" onClick={handleSend} disabled={status === 'complete'} className="absolute right-1 top-1 h-8 w-8 bg-transparent text-[#E43632] hover:bg-red-50">
                     <Send size={16} />
                  </Button>
               </div>
               {/* DEBUG BUTTON */}
               {status !== 'complete' && status !== 'empty' && (
                  <Button onClick={handleComplete} variant="ghost" className="w-full h-6 text-[10px] text-gray-400 hover:text-gray-600">
                     (Simulate Completion)
                  </Button>
               )}
            </div>
         </div>

         {/* CENTER: CANVAS */}
         <div className="flex-1 relative h-full bg-gray-50 z-10 overflow-hidden">
            
            {/* CANVAS PLACEHOLDER / HELP GUIDE */}
            {status === 'empty' && (
               <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none animate-in fade-in zoom-in-95 duration-500">
                  <div 
                     className="max-w-md w-full p-8 bg-white/90 backdrop-blur-sm rounded-2xl border border-gray-200 shadow-2xl text-center space-y-6"
                  >
                     <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                        <Zap className="text-[#E43632] w-8 h-8" />
                     </div>
                     
                     <div>
                        <h2 className="text-xl font-bold text-[#0A0A0A]">Waiting for requirements...</h2>
                        <p className="text-gray-500 mt-2">
                           Describe your process in the chat to generate your automation blueprint.
                        </p>
                     </div>

                     <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-gray-600 flex flex-col items-center gap-2">
                           <MessageSquare size={20} className="text-blue-500"/>
                           Chat Details
                        </div>
                        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-gray-600 flex flex-col items-center gap-2">
                           <FileStack size={20} className="text-orange-500"/>
                           Drop Docs
                        </div>
                        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-gray-600 flex flex-col items-center gap-2">
                           <ImageIcon size={20} className="text-purple-500"/>
                           Screenshots
                        </div>
                        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 text-xs font-medium text-gray-600 flex flex-col items-center gap-2">
                           <Video size={20} className="text-emerald-500"/>
                           Record Video
                        </div>
                     </div>

                     <div className="flex items-center justify-center gap-2 text-[10px] text-gray-400">
                        <div className="w-2 h-2 rounded-full bg-[#E43632] animate-pulse" />
                        Waiting for input
                     </div>
                  </div>
               </div>
            )}

            {/* POST-GENERATION HINT */}
            {(status === 'building' || status === 'complete') && !selectedStepId && (
               <div 
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 bg-[#0A0A0A] text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 pointer-events-none animate-in slide-in-from-bottom-4 fade-in duration-500"
               >
                  <MousePointerClick size={16} className="text-[#E43632]" />
                  <span className="text-xs font-medium">Click on any step to configure or refine</span>
               </div>
            )}

            {/* SCANNING GRID ANIMATION (When empty) */}
            {status === 'empty' && (
               <div className="absolute inset-0 pointer-events-none opacity-20 overflow-hidden">
                  <div 
                     className="w-full h-full"
                     style={{
                        backgroundImage: 'radial-gradient(#E43632 1px, transparent 1px)',
                        backgroundSize: '40px 40px'
                     }}
                  />
               </div>
            )}

            <StudioCanvas 
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              isSynthesizing={isSynthesizing}
            />
         </div>

         {/* RIGHT: INSPECTOR (Replacing Insights) */}
         <div className={`shrink-0 h-full z-20 bg-white transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] border-l border-gray-200 shadow-xl ${
             selectedStepId ? 'w-[420px] translate-x-0' : 'w-0 translate-x-full opacity-0'
         }`}>
             <StudioInspector 
                 selectedStep={selectedStepData}
                 onClose={() => setSelectedStepId(null)}
                 onConnect={() => {}}
                 onAddException={() => {}}
             />
         </div>

      </div>
    </div>
  );
};
