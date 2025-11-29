import React, { useState, useEffect } from 'react';
import { Send, Paperclip, Mic, Monitor, Sparkles, Loader2, ArrowRight, CheckCircle2, Plus, AlertCircle, FileText } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

// --- MOCK CANVAS COMPONENT ---
const ExtractionCanvas = ({ status }: { status: 'empty' | 'analyzing' | 'ready' }) => {
  if (status === 'empty') {
    return (
       <div className="flex flex-col items-center justify-center h-full text-gray-300">
          <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center mb-4">
             <Sparkles size={32} />
          </div>
          <p className="text-sm font-medium">Your workflow map will appear here.</p>
       </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center">
       {status === 'analyzing' && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
             <Loader2 className="w-8 h-8 text-[#E43632] animate-spin mb-2" />
             <p className="text-xs font-bold text-[#0A0A0A]">Analyzing Requirements...</p>
          </div>
       )}
       
       <div className="space-y-8 relative z-0">
          {/* Simple Vertical Flow Visualization */}
          <div className="flex items-center gap-4 opacity-50">
             <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600"><Sparkles size={20} /></div>
             <div className="h-0.5 w-12 bg-gray-200" />
             <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400"><FileText size={20} /></div>
             <div className="h-0.5 w-12 bg-gray-200" />
             <div className="w-12 h-12 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-400"><CheckCircle2 size={20} /></div>
          </div>
       </div>
    </div>
  );
};

export const OnboardingCapture: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Tell me what your workflow does, or upload any files to get started.' }
  ]);
  const [status, setStatus] = useState<'empty' | 'analyzing' | 'ready'>('empty');
  const [extractionData, setExtractionData] = useState<{steps: string[], systems: string[], missing: string[]} | null>(null);

  const handleSend = () => {
    if (!input.trim()) return;
    
    const newMsg = { role: 'user', text: input };
    setMessages([...messages, newMsg]);
    setInput('');
    setStatus('analyzing');

    // Simulate AI Processing
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'ai', text: "I've analyzed your request. I found 3 key steps and 2 systems. Please confirm the approval threshold on the right." }]);
      setStatus('ready');
      setExtractionData({
         steps: ['Monitor Gmail for Invoices', 'Extract Data with AI', 'Create Draft Bill in Xero'],
         systems: ['Gmail', 'Xero', 'Slack'],
         missing: ['Approval Threshold Amount?', 'Notification Channel?']
      });
    }, 2000);
  };

  return (
    <div className="flex h-full bg-white overflow-hidden">
      
      {/* LEFT PANEL: Chat Interface */}
      <div className="w-[400px] flex flex-col border-r border-gray-200 bg-white z-20 shadow-xl">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
           <h2 className="font-bold text-[#0A0A0A] text-lg">WRK Copilot</h2>
           <p className="text-xs text-gray-500">Describe requirements naturally.</p>
           
           <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" className="flex-1 text-xs h-9 bg-white"><Paperclip size={14} className="mr-2"/> Upload</Button>
              <Button variant="outline" size="sm" className="flex-1 text-xs h-9 bg-white"><Monitor size={14} className="mr-2"/> Record</Button>
           </div>
        </div>

        <ScrollArea className="flex-1 p-6 space-y-6 bg-white">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''} mb-4`}>
              <Avatar className="w-8 h-8 shrink-0 border border-gray-100">
                <AvatarFallback className={m.role === 'ai' ? 'bg-[#E43632] text-white' : 'bg-[#0A0A0A] text-white'}>
                  {m.role === 'ai' ? 'AI' : 'ME'}
                </AvatarFallback>
              </Avatar>
              <div className={`p-4 rounded-2xl text-sm leading-relaxed max-w-[85%] shadow-sm ${
                m.role === 'user' ? 'bg-[#0A0A0A] text-white rounded-tr-none' : 'bg-gray-50 text-gray-800 border border-gray-100 rounded-tl-none'
              }`}>
                {m.text}
              </div>
            </div>
          ))}
          {status === 'analyzing' && (
            <div className="flex gap-3">
               <Avatar className="w-8 h-8 shrink-0"><AvatarFallback className="bg-[#E43632] text-white">AI</AvatarFallback></Avatar>
               <div className="bg-gray-50 p-3 rounded-2xl rounded-tl-none border border-gray-100">
                 <Loader2 className="animate-spin w-4 h-4 text-gray-400" />
               </div>
            </div>
          )}
        </ScrollArea>

        <div className="p-4 border-t border-gray-100 bg-white">
           <div className="relative">
              <Input 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type your process here..." 
                className="pr-12 py-6 bg-gray-50 border-gray-200 focus-visible:ring-[#E43632]"
              />
              <Button 
                size="icon" 
                onClick={handleSend}
                className="absolute right-1 top-1 h-10 w-10 bg-transparent hover:bg-gray-200 text-[#E43632]"
              >
                <Send size={18} />
              </Button>
           </div>
        </div>
      </div>

      {/* CENTER PANEL: Canvas Placeholder */}
      <div className="flex-1 bg-[#F9FAFB] relative flex flex-col">
         <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
         <div className="relative z-10 flex-1 p-8">
            <ExtractionCanvas status={status} />
         </div>
      </div>

      {/* RIGHT PANEL: AI Extraction Summary */}
      <div className="w-[350px] border-l border-gray-200 bg-white z-10 flex flex-col">
         <div className="p-6 border-b border-gray-100">
            <h3 className="font-bold text-[#0A0A0A]">Extraction Summary</h3>
            <p className="text-xs text-gray-500">Real-time analysis of your input.</p>
         </div>

         <div className="flex-1 p-6 space-y-8 overflow-y-auto">
            {/* Steps */}
            <div>
               <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center justify-between">
                  Steps Identified
                  {extractionData && <Badge variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-600">{extractionData.steps.length}</Badge>}
               </h4>
               <div className="space-y-2">
                  {extractionData ? extractionData.steps.map((step, i) => (
                     <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">{i+1}</div>
                        <span className="text-sm font-medium text-[#0A0A0A]">{step}</span>
                     </div>
                  )) : (
                     <div className="p-4 border border-dashed border-gray-200 rounded-lg text-center text-xs text-gray-400">
                        Waiting for input...
                     </div>
                  )}
               </div>
            </div>

            {/* Systems */}
            <div>
               <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Systems Detected</h4>
               <div className="flex flex-wrap gap-2">
                  {extractionData ? extractionData.systems.map((sys, i) => (
                     <Badge key={i} variant="outline" className="px-3 py-1 border-gray-200 text-gray-600 bg-white">
                        {sys}
                     </Badge>
                  )) : (
                     <span className="text-xs text-gray-400 italic">None yet</span>
                  )}
               </div>
            </div>

            {/* Missing Info / Confirmation */}
            {extractionData && (
               <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 animate-in slide-in-from-bottom-2 fade-in">
                  <div className="flex items-center gap-2 mb-2">
                     <AlertCircle size={14} className="text-amber-600" />
                     <span className="text-xs font-bold text-amber-800">Please Confirm</span>
                  </div>
                  <div className="space-y-2">
                     {extractionData.missing.map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-xs text-amber-900 bg-white/50 p-2 rounded border border-amber-100/50">
                           <span>{item}</span>
                           <Button size="sm" variant="ghost" className="h-5 px-2 text-[10px] text-amber-700 hover:bg-amber-100 hover:text-amber-900">
                              Edit
                           </Button>
                        </div>
                     ))}
                  </div>
               </div>
            )}
         </div>

         <div className="p-6 border-t border-gray-100 bg-gray-50">
            <Button 
               onClick={onNext} 
               disabled={!extractionData}
               className={cn(
                  "w-full h-12 font-bold text-white transition-all shadow-lg",
                  extractionData ? "bg-[#0A0A0A] hover:bg-gray-800 hover:-translate-y-0.5" : "bg-gray-300 cursor-not-allowed"
               )}
            >
               Continue to Review <ArrowRight size={16} className="ml-2" />
            </Button>
         </div>
      </div>

    </div>
  );
};
