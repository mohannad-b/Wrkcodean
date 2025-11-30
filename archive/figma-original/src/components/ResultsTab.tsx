import React, { useState } from 'react';
import { 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ChevronRight, 
  ChevronDown,
  Sparkles,
  Terminal,
  RefreshCw
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '../lib/utils';

export const ResultsTab: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  
  const handleRunTest = () => {
    setIsRunning(true);
    setHasRun(false);
    // Mock simulation
    setTimeout(() => {
      setIsRunning(false);
      setHasRun(true);
    }, 2000);
  };

  return (
    <div className="flex h-full bg-gray-50">
      {/* Left Panel: Test Configuration */}
      <div className="w-[320px] bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-100">
           <h2 className="text-lg font-bold text-[#0A0A0A] mb-1">Run Test</h2>
           <p className="text-sm text-gray-500">Simulate the workflow with sample data.</p>
        </div>
        
        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
           {/* AI Input Suggestions */}
           <div className="space-y-3">
             <div className="flex items-center justify-between">
               <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Input Data</label>
               <Badge variant="secondary" className="bg-red-50 text-[#E43632] hover:bg-red-100 gap-1 text-[10px] cursor-pointer border-red-100">
                 <Sparkles size={10} /> Generate Sample
               </Badge>
             </div>
             
             <div className="space-y-3">
               <div className="space-y-1">
                 <span className="text-xs text-gray-500">Email Subject</span>
                 <input 
                   type="text" 
                   defaultValue="Invoice #9921 from Acme Corp"
                   className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-[#E43632] focus:border-[#E43632]"
                 />
               </div>
               <div className="space-y-1">
                 <span className="text-xs text-gray-500">Sender</span>
                 <input 
                   type="text" 
                   defaultValue="billing@acme.com"
                   className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-[#E43632] focus:border-[#E43632]"
                 />
               </div>
               <div className="space-y-1">
                 <span className="text-xs text-gray-500">Attachment Name</span>
                 <input 
                   type="text" 
                   defaultValue="inv-9921.pdf"
                   className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-[#E43632] focus:border-[#E43632]"
                 />
               </div>
             </div>
           </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
           <Button 
             onClick={handleRunTest}
             disabled={isRunning}
             className="w-full bg-[#0A0A0A] hover:bg-gray-900 text-white h-11 font-bold shadow-lg shadow-gray-900/10"
           >
             {isRunning ? (
               <>
                 <RefreshCw size={16} className="mr-2 animate-spin" /> Running...
               </>
             ) : (
               <>
                 <Play size={16} className="mr-2" /> Run Test
               </>
             )}
           </Button>
        </div>
      </div>

      {/* Right Panel: Results */}
      <div className="flex-1 overflow-y-auto p-8">
        {!hasRun && !isRunning ? (
           <div className="h-full flex flex-col items-center justify-center text-gray-400">
             <div className="w-16 h-16 bg-white border border-gray-200 rounded-full flex items-center justify-center mb-4 shadow-sm">
               <Play size={24} className="text-gray-300 ml-1" />
             </div>
             <p className="text-sm font-medium">Ready to start testing</p>
           </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
             <div className="flex items-center justify-between">
               <h3 className="text-xl font-bold text-[#0A0A0A]">Test Results</h3>
               {hasRun && (
                 <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 px-3 py-1">
                   <AlertTriangle size={12} className="mr-1.5" />
                   Partial Success
                 </Badge>
               )}
             </div>

             {/* Timeline */}
             <div className="space-y-4 relative before:absolute before:left-4 before:top-4 before:h-[calc(100%-2rem)] before:w-px before:bg-gray-200">
                
                <TestStep 
                  status="success"
                  title="Trigger: New Email"
                  desc="Received email from billing@acme.com"
                  duration="0.2s"
                />
                
                <TestStep 
                  status="success"
                  title="Action: Extract Details"
                  desc="Extracted Amount: $5,000.00, Vendor: Acme Corp"
                  duration="1.4s"
                  details={{
                    "raw_text": "INVOICE #9921\nTotal: $5,000.00\nDate: Nov 28, 2025",
                    "confidence": 0.98
                  }}
                />

                <TestStep 
                  status="success"
                  title="Logic: Check Amount"
                  desc="Condition met: $5,000 >= $5,000"
                  duration="0.1s"
                />

                {/* Failed Step */}
                <TestStep 
                  status="error"
                  title="Action: Create Draft Bill"
                  desc="Failed to connect to Xero API"
                  duration="0.8s"
                  error="Error: Connection timeout (500) - The requested resource is unavailable."
                  details={{
                    "request_payload": { "vendor": "Acme Corp", "amount": 5000 },
                    "response_code": 500
                  }}
                />

             </div>

             {/* AI Fix Suggestion (Only shows if there is an error) */}
             <div className="mt-8 bg-white rounded-xl border border-gray-200 shadow-lg shadow-red-500/5 overflow-hidden animate-in slide-in-from-bottom-4">
               <div className="bg-gradient-to-r from-[#E43632] to-[#FF5F5F] px-6 py-3 flex items-center justify-between text-white">
                 <div className="flex items-center gap-2 font-bold text-sm">
                   <Sparkles size={16} /> WRK Copilot
                 </div>
                 <Badge className="bg-white/20 text-white border-none hover:bg-white/30 text-[10px]">Fix Available</Badge>
               </div>
               <div className="p-6">
                 <h4 className="font-bold text-[#0A0A0A] mb-2">It looks like Xero is timing out.</h4>
                 <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                   This often happens when the API token expires or the service is experiencing downtime. I can add a retry mechanism to handle this automatically.
                 </p>
                 <div className="flex gap-3">
                   <Button size="sm" className="bg-[#0A0A0A] hover:bg-gray-800 text-white text-xs">
                     Auto-fix: Add Retry Logic
                   </Button>
                   <Button variant="outline" size="sm" className="text-gray-600 text-xs">
                     Ignore
                   </Button>
                 </div>
               </div>
             </div>

          </div>
        )}
      </div>
    </div>
  );
};

const TestStep = ({ status, title, desc, duration, error, details }: any) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative pl-10 group">
       {/* Status Icon */}
       <div className={cn(
         "absolute left-0 top-0 w-8 h-8 rounded-full flex items-center justify-center border-4 border-gray-50 z-10 shadow-sm transition-transform group-hover:scale-110",
         status === 'success' ? "bg-emerald-500 text-white" : 
         status === 'error' ? "bg-[#E43632] text-white" : "bg-gray-200 text-gray-500"
       )}>
         {status === 'success' ? <CheckCircle2 size={14} /> : 
          status === 'error' ? <XCircle size={14} /> : <div className="w-2 h-2 bg-gray-400 rounded-full" />}
       </div>

       {/* Card */}
       <div className={cn(
         "bg-white rounded-xl border shadow-sm transition-all",
         status === 'error' ? "border-red-200 shadow-red-100" : "border-gray-200 hover:shadow-md"
       )}>
          <div 
            className="p-4 flex items-start justify-between cursor-pointer"
            onClick={() => details && setIsOpen(!isOpen)}
          >
             <div>
               <div className="flex items-center gap-2 mb-1">
                 <h4 className={cn("text-sm font-bold", status === 'error' ? "text-[#E43632]" : "text-[#0A0A0A]")}>
                   {title}
                 </h4>
                 <span className="text-[10px] font-medium text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-md border border-gray-100">
                   {duration}
                 </span>
               </div>
               <p className="text-xs text-gray-500">{desc}</p>
               {error && (
                 <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded-lg text-[11px] text-red-700 font-medium flex items-start gap-2">
                   <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                   {error}
                 </div>
               )}
             </div>
             
             {details && (
               <div className={cn("transition-transform duration-200 text-gray-400", isOpen && "rotate-180")}>
                 <ChevronDown size={16} />
               </div>
             )}
          </div>

          {/* Expandable Details */}
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleContent>
              <div className="px-4 pb-4 pt-0">
                <div className="bg-gray-900 rounded-lg p-3 font-mono text-[10px] text-gray-300 overflow-x-auto border border-gray-800 shadow-inner">
                  <div className="flex items-center gap-1.5 text-gray-500 mb-2 border-b border-gray-800 pb-2">
                    <Terminal size={10} /> Technical Logs
                  </div>
                  <pre>{JSON.stringify(details, null, 2)}</pre>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
       </div>
    </div>
  );
};
