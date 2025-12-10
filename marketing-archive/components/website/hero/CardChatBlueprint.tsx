import React from 'react';
import { motion } from 'motion/react';
import { HeroNode } from './HeroNode';
import { Cursor } from './Cursor';
import { Sparkles, Send } from 'lucide-react';

export const CardChatBlueprint = () => {
  return (
    <div className="w-full h-full flex overflow-hidden bg-white rounded-xl shadow-2xl border border-gray-800/10">
      {/* Left: Chat Panel */}
      <div className="w-[320px] bg-gray-50 border-r border-gray-200 flex flex-col">
        <div className="h-12 border-b border-gray-200 flex items-center px-4 gap-2 bg-white">
           <Sparkles size={14} className="text-[#E43632]" />
           <span className="text-xs font-bold text-gray-900">Wrk CoPilot</span>
        </div>
        
        <div className="flex-1 p-4 space-y-4 overflow-y-auto scrollbar-hide">
           {/* User Message */}
           <motion.div 
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.2 }}
             className="flex gap-3"
           >
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600 shrink-0">JD</div>
              <div className="bg-white border border-gray-200 p-3 rounded-xl rounded-tl-none shadow-sm">
                 <p className="text-xs text-gray-700 leading-relaxed">
                    I need a process to handle new vendor requests. It should check if they are in NetSuite, and if not, ask for W9 forms.
                 </p>
              </div>
           </motion.div>

           {/* AI Response */}
           <motion.div 
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 1.2 }}
             className="flex gap-3"
           >
              <div className="w-6 h-6 rounded-full bg-[#E43632] flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-md shadow-red-500/20">AI</div>
              <div className="bg-blue-50/50 border border-blue-100 p-3 rounded-xl rounded-tr-none shadow-sm w-full">
                 <p className="text-xs text-gray-700 leading-relaxed mb-2">
                    I've drafted a blueprint for the <strong>Vendor Onboarding</strong> process:
                 </p>
                 <ul className="space-y-1 text-[11px] text-gray-600 pl-4 list-disc marker:text-blue-400">
                    <li>Trigger: New Email Request</li>
                    <li>Action: Search NetSuite Vendor</li>
                    <li>Logic: If Exists → Notify Team</li>
                    <li>Logic: If New → Request W9</li>
                 </ul>
              </div>
           </motion.div>
        </div>

        {/* Input Area */}
        <div className="p-3 border-t border-gray-200 bg-white">
           <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <span className="text-xs text-gray-400">Add an approval step...</span>
              <Send size={12} className="ml-auto text-gray-300" />
           </div>
        </div>
      </div>

      {/* Right: Blueprint View */}
      <div className="flex-1 bg-[#F9FAFB] relative p-8 flex flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(#E5E7EB 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }} />
        
        {/* Nodes */}
        <div className="relative z-10 flex flex-col gap-6 scale-90 origin-top">
           <HeroNode 
             title="New Vendor Request" 
             description="Triggered by email to vendors@company.com" 
             type="Trigger" 
             icon="Mail" 
             className="mx-auto"
           />
           
           <div className="h-8 w-px bg-gray-300 mx-auto" />
           
           <HeroNode 
             title="Search NetSuite" 
             description="Find vendor by Tax ID or Name" 
             type="Action" 
             icon="Globe"
             status="ai-suggested"
             className="mx-auto"
           />

           <div className="h-8 w-px bg-gray-300 mx-auto" />

           <HeroNode 
             title="Check Existence" 
             description="Condition: Vendor ID is not null" 
             type="Logic" 
             icon="Split" 
             className="mx-auto"
           />
        </div>

        {/* Cursor Animation */}
        <motion.div
          animate={{ 
            x: [100, 250, 180], 
            y: [100, 300, 200] 
          }}
          transition={{ 
            duration: 4,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut"
          }}
        >
          <Cursor name="Alex" color="#0EA5E9" x={0} y={0} />
        </motion.div>
      </div>
    </div>
  );
};
