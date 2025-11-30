import React, { useState } from 'react';
import { 
  Trash2, 
  X, 
  Sparkles, 
  ChevronDown, 
  ChevronRight, 
  Shield, 
  Clock, 
  AlertTriangle, 
  Bell,
  Users,
  Bot,
  FileText,
  UserCheck,
  Zap,
  Settings,
  GitBranch,
  ArrowRight
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from './ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { cn } from '../lib/utils';

interface StepData {
  id: string;
  title: string;
  description: string;
  type: 'trigger' | 'action' | 'logic' | 'human';
  status: 'complete' | 'warning' | 'error' | 'ai-suggested';
  inputs: string[];
  outputs?: string[];
  exceptions?: { condition: string; outcome: string }[];
}

interface StudioInspectorProps {
  selectedStep: StepData | null;
  onClose: () => void;
  onConnect: () => void;
  onAddException: () => void;
}

export const StudioInspector: React.FC<StudioInspectorProps> = ({ 
  selectedStep, 
  onClose, 
  onConnect, 
  onAddException 
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [responsibility, setResponsibility] = useState('automated');

  if (!selectedStep) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white border-l border-gray-200 p-8 text-center">
         <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100">
            <Settings className="text-gray-400" size={20} />
         </div>
         <h3 className="text-[#0A0A0A] font-bold mb-2">No Step Selected</h3>
         <p className="text-sm text-gray-500 max-w-[200px] mx-auto">Click on a block in the canvas to edit its business rules.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200 shadow-xl shadow-gray-200/50 overflow-hidden">
      
      {/* HEADER */}
      <div className="flex-none px-6 py-5 border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="flex items-start justify-between mb-2">
           <div>
             <div className="flex items-center gap-2 mb-1">
               <Badge variant="outline" className={`capitalize rounded-md px-2 py-0.5 h-auto text-[10px] font-semibold tracking-wide ${
                  selectedStep.status === 'complete' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                  selectedStep.status === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                  selectedStep.status === 'ai-suggested' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                  'border-gray-200 bg-gray-50 text-gray-600'
               }`}>
                  {selectedStep.status === 'ai-suggested' ? 'Draft' : selectedStep.status}
               </Badge>
               <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">ID: {selectedStep.id}</span>
             </div>
             <h2 className="text-xl font-bold text-[#0A0A0A] leading-tight">{selectedStep.title}</h2>
           </div>
           <div className="flex gap-1">
             <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600 transition-colors">
               <Trash2 size={16} />
             </Button>
             <Button onClick={onClose} variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-[#0A0A0A] transition-colors">
               <X size={16} />
             </Button>
           </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 w-full overflow-y-auto min-h-0">
        <div className="p-6 pb-20 space-y-8">
          
          {/* LOGIC / DECISION RULE (Only for Logic Nodes) */}
          {selectedStep.type === 'logic' && (
            <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-300">
              <Label className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-2">
                Decision Rule
              </Label>
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">
                  <GitBranch size={16} className="text-[#E43632]" />
                  Condition Logic
                </div>
                
                {/* Row 1: Condition */}
                <div className="flex items-center gap-2">
                   <span className="text-xs font-bold text-gray-500 w-10 shrink-0">IF</span>
                   <div className="flex-1 flex items-center gap-2">
                      <Select defaultValue="amount">
                        <SelectTrigger className="h-8 text-xs bg-gray-50 border-gray-200 font-medium"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="amount">Amount</SelectItem>
                          <SelectItem value="vendor">Vendor</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select defaultValue=">">
                        <SelectTrigger className="w-[60px] h-8 text-xs bg-gray-50 border-gray-200 font-bold text-[#E43632]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value=">">&gt;</SelectItem>
                          <SelectItem value="<">&lt;</SelectItem>
                          <SelectItem value="=">=</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input className="h-8 text-xs bg-gray-50 border-gray-200 font-medium w-20" defaultValue="5000" />
                   </div>
                </div>

                {/* Row 2: True Path */}
                <div className="flex items-center gap-2">
                   <span className="text-xs font-bold text-gray-500 w-10 shrink-0">THEN</span>
                   <div className="flex-1 flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                      <ArrowRight size={12} className="text-gray-400" />
                      <span className="text-xs font-medium text-gray-700">Request Approval</span>
                   </div>
                </div>

                {/* Row 3: False Path */}
                <div className="flex items-center gap-2">
                   <span className="text-xs font-bold text-gray-500 w-10 shrink-0">ELSE</span>
                   <div className="flex-1 flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
                      <ArrowRight size={12} className="text-gray-400" />
                      <span className="text-xs font-medium text-gray-700">Create Draft Bill</span>
                   </div>
                </div>
                
                <div className="flex items-start gap-1.5 pt-1">
                  <Sparkles size={10} className="text-[#E43632] mt-0.5 shrink-0" />
                  <p className="text-[10px] text-gray-400 leading-tight">
                    AI inferred this rule from your description. You can edit any part of it.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 1. SUMMARY (Required) */}
          <div className="space-y-3">
            <Label className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-2">
              Summary <span className="text-[#E43632]">*</span>
            </Label>
            <div className="relative group">
              <div className="absolute -top-2.5 right-3 z-10 bg-white px-2">
                 <div className="flex items-center gap-1 text-[10px] font-medium text-[#E43632] bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                    <Sparkles size={8} /> AI Generated Draft
                 </div>
              </div>
              <Textarea 
                className="min-h-[100px] text-base bg-white border-gray-200 shadow-sm hover:border-gray-300 focus-visible:ring-[#E43632] resize-none p-4 leading-relaxed rounded-xl transition-all" 
                defaultValue={selectedStep.description}
                placeholder="Describe what happens in this step..."
              />
            </div>
          </div>

          {/* 2. GOAL / OUTCOME (Required) */}
          <div className="space-y-3">
             <Label className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-2">
               Goal / Outcome <span className="text-[#E43632]">*</span>
             </Label>
             <Input 
               className="h-11 bg-gray-50/50 border-gray-200 hover:bg-white focus-visible:ring-[#E43632] transition-all text-sm"
               placeholder="What should this step accomplish?"
             />
             <p className="text-[11px] text-gray-400 pl-1">
               e.g. "Prepare invoice data for Xero" or "Notify sales rep"
             </p>
          </div>

          {/* 3. RESPONSIBILITY (Required) */}
          <div className="space-y-3">
             <Label className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-2">
               Responsibility <span className="text-[#E43632]">*</span>
             </Label>
             <Tabs value={responsibility} onValueChange={setResponsibility} className="w-full">
               <TabsList className="w-full h-auto p-1 bg-gray-100/50 border border-gray-100 rounded-lg grid grid-cols-3 gap-1">
                 <TabsTrigger 
                   value="automated" 
                   className="data-[state=active]:bg-white data-[state=active]:text-[#E43632] data-[state=active]:shadow-sm py-2.5 text-xs font-medium"
                 >
                   <Zap size={14} className="mb-1 mx-auto block sm:hidden" />
                   <span className="hidden sm:block">Automated</span>
                   <span className="block sm:hidden">Auto</span>
                 </TabsTrigger>
                 <TabsTrigger 
                   value="human" 
                   className="data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-sm py-2.5 text-xs font-medium"
                 >
                   <UserCheck size={14} className="mb-1 mx-auto block sm:hidden" />
                   <span className="hidden sm:block">Human Review</span>
                   <span className="block sm:hidden">Review</span>
                 </TabsTrigger>
                 <TabsTrigger 
                   value="approval" 
                   className="data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm py-2.5 text-xs font-medium"
                 >
                   <Shield size={14} className="mb-1 mx-auto block sm:hidden" />
                   <span className="hidden sm:block">Approval</span>
                   <span className="block sm:hidden">Approve</span>
                 </TabsTrigger>
               </TabsList>
             </Tabs>
          </div>

          {/* 4. NOTES / EXCEPTIONS (Optional) */}
          <div className="space-y-3">
             <Label className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-2">
               Notes / Exceptions
             </Label>
             
             {/* Render Added Exceptions */}
             {selectedStep.exceptions && selectedStep.exceptions.length > 0 && (
               <div className="space-y-2 mb-3">
                 {selectedStep.exceptions.map((ex, idx) => (
                   <div key={idx} className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-xs flex items-start gap-2">
                     <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                     <div>
                       <span className="font-bold text-amber-800">If: </span>
                       <span className="text-amber-900">{ex.condition}</span>
                       <br/>
                       <span className="font-bold text-amber-800">Then: </span>
                       <span className="text-amber-900">{ex.outcome}</span>
                     </div>
                   </div>
                 ))}
               </div>
             )}

             <Textarea 
               className="min-h-[80px] text-sm bg-gray-50/50 border-gray-200 focus-visible:ring-[#E43632] resize-none p-3" 
               placeholder="Anything unusual or important about this step?"
             />
             <button 
               onClick={onAddException}
               className="text-xs font-medium text-[#E43632] hover:text-[#C12E2A] hover:underline flex items-center gap-1 transition-colors"
             >
               + Add Exception (optional)
             </button>
          </div>

          {/* ADVANCED OPTIONS (Collapsed) */}
          <div className="pt-4 border-t border-gray-100">
            <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full flex justify-between items-center p-0 h-auto hover:bg-transparent group">
                  <span className="text-sm font-bold text-[#0A0A0A]">Advanced Options</span>
                  <div className={`p-1 rounded-full transition-all ${isAdvancedOpen ? 'bg-gray-100 rotate-90' : 'group-hover:bg-gray-50'}`}>
                    <ChevronRight size={16} className="text-gray-400" />
                  </div>
                </Button>
              </CollapsibleTrigger>
              
              <CollapsibleContent className="space-y-6 mt-6 animate-in slide-in-from-top-2 duration-200">
                 
                 {/* Systems */}
                 <div className="space-y-2">
                   <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Systems Involved</Label>
                   <div className="flex flex-wrap gap-2">
                     {['Email', 'Slack', 'Xero', 'Salesforce'].map(sys => (
                       <Badge 
                         key={sys} 
                         variant="secondary" 
                         className="bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer font-normal transition-colors hover:text-[#E43632] hover:border-red-200 border border-transparent"
                         onClick={onConnect}
                       >
                         {sys}
                       </Badge>
                     ))}
                     <button onClick={onConnect} className="text-[10px] text-gray-400 border border-dashed border-gray-300 rounded-full px-2 py-0.5 hover:border-[#E43632] hover:text-[#E43632]">
                       + Connect
                     </button>
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    {/* Timing / SLA */}
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        <Clock size={10} /> Timing / SLA
                      </Label>
                      <Select defaultValue="24h">
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="realtime">Real-time</SelectItem>
                          <SelectItem value="1h">1 Hour</SelectItem>
                          <SelectItem value="24h">24 Hours</SelectItem>
                          <SelectItem value="week">1 Week</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Risk Level */}
                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle size={10} /> Risk Level
                      </Label>
                      <Select defaultValue="low">
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low Risk</SelectItem>
                          <SelectItem value="medium">Medium Risk</SelectItem>
                          <SelectItem value="high">High Risk</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                 </div>

                 {/* Notifications */}
                 <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                      <Bell size={10} /> Notifications
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg w-full">
                         <Switch id="notify-slack" className="data-[state=unchecked]:bg-gray-200" />
                         <Label htmlFor="notify-slack" className="text-xs font-medium">Slack</Label>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg w-full">
                         <Switch id="notify-email" className="data-[state=unchecked]:bg-gray-200" />
                         <Label htmlFor="notify-email" className="text-xs font-medium">Email</Label>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg w-full">
                         <Switch id="notify-sms" className="data-[state=unchecked]:bg-gray-200" />
                         <Label htmlFor="notify-sms" className="text-xs font-medium">SMS</Label>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg w-full">
                         <Switch id="notify-teams" className="data-[state=unchecked]:bg-gray-200" />
                         <Label htmlFor="notify-teams" className="text-xs font-medium">MS Teams</Label>
                      </div>
                    </div>
                 </div>

                 {/* Ops Notes */}
                 <div className="space-y-2">
                    <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Notes for Ops Team</Label>
                    <Textarea 
                      className="min-h-[80px] text-xs bg-yellow-50/50 border-yellow-100 focus-visible:ring-yellow-400 resize-none p-3 placeholder:text-yellow-700/40" 
                      placeholder="Technical implementation details..."
                    />
                 </div>

              </CollapsibleContent>
            </Collapsible>
          </div>

        </div>
      </div>

      {/* FOOTER */}
      <div className="flex-none p-6 border-t border-gray-200 bg-white space-y-4">
        <Button className="w-full bg-[#0A0A0A] hover:bg-gray-900 text-white font-bold shadow-lg shadow-gray-900/10 h-11 text-sm rounded-lg transition-all hover:-translate-y-0.5">
          Save Changes
        </Button>
        <div className="flex items-center justify-center">
           <Button variant="link" className="text-xs text-gray-400 hover:text-gray-600 h-auto p-0 font-medium">Discard Changes</Button>
        </div>
      </div>

    </div>
  );
};
