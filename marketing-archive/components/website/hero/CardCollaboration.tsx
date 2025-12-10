import React from 'react';
import { motion } from 'motion/react';
import { HeroNode } from './HeroNode';
import { Cursor } from './Cursor';
import { MessageSquarePlus, Users, Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export const CardCollaboration = () => {
  return (
    <div className="w-full h-full flex flex-col bg-[#F9FAFB] rounded-xl shadow-2xl border border-gray-800/10 overflow-hidden relative">
      {/* Header: Presence Bar */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 z-20">
         <div className="flex items-center gap-3">
            <div className="font-bold text-gray-900">Vendor Onboarding v2</div>
            <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[10px] font-medium border border-gray-200">Draft</span>
         </div>
         
         <div className="flex items-center gap-4">
            <div className="flex -space-x-2">
               <Avatar className="w-8 h-8 border-2 border-white ring-1 ring-gray-100">
                 <AvatarImage src="https://i.pravatar.cc/100?img=1" />
                 <AvatarFallback>AL</AvatarFallback>
               </Avatar>
               <Avatar className="w-8 h-8 border-2 border-white ring-1 ring-gray-100">
                 <AvatarImage src="https://i.pravatar.cc/100?img=5" />
                 <AvatarFallback>YA</AvatarFallback>
               </Avatar>
               <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs text-gray-500 font-bold ring-1 ring-gray-100">
                  +3
               </div>
            </div>
            <div className="h-4 w-px bg-gray-200" />
            <button className="bg-[#E43632] hover:bg-[#C12E2A] text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
               Share
            </button>
         </div>
      </div>

      {/* Canvas Area */}
      <div className="flex-1 relative overflow-hidden p-8 flex items-center justify-center">
        <div className="absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(#E5E7EB 1.5px, transparent 1.5px)', backgroundSize: '24px 24px' }} />

        {/* Comment Pin 1 */}
        <motion.div 
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="absolute top-32 left-1/4 z-30"
        >
           <div className="relative group">
              <div className="w-8 h-8 bg-[#E43632] rounded-full rounded-bl-none flex items-center justify-center text-white shadow-lg shadow-red-500/20 cursor-pointer hover:scale-110 transition-transform">
                 <MessageSquarePlus size={16} />
              </div>
              <div className="absolute left-10 top-0 bg-white border border-gray-200 p-3 rounded-xl rounded-tl-none shadow-xl w-48 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
                 <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-xs text-gray-900">Alex</span>
                    <span className="text-[10px] text-gray-400">Just now</span>
                 </div>
                 <p className="text-[11px] text-gray-600">Should we add a Slack notification here for the finance team?</p>
              </div>
           </div>
        </motion.div>

        {/* Expanded Nodes Layout */}
        <div className="relative z-10 flex gap-12 scale-110 origin-center">
           {/* Left Branch */}
           <div className="flex flex-col gap-8 items-center">
              <HeroNode 
                 title="Request W9 Form" 
                 description="Send email with secure upload link" 
                 type="Action" 
                 icon="Mail" 
                 status="complete"
                 selected={true}
              />
              <div className="h-8 w-px bg-gray-300" />
              <HeroNode 
                 title="Wait for Upload" 
                 description="Pause workflow up to 3 days" 
                 type="Wait" 
                 icon="Clock" 
              />
           </div>

           {/* Right Branch (Being Added) */}
           <div className="flex flex-col gap-8 items-center opacity-50 blur-[1px]">
               <HeroNode 
                 title="Notify Finance" 
                 description="Post to #finance-alerts" 
                 type="Action" 
                 icon="Bell" 
               />
               <div className="h-8 w-px bg-gray-300 border-l border-dashed" />
               <div className="w-[260px] h-24 border-2 border-dashed border-gray-300 rounded-xl flex items-center justify-center bg-gray-50/50">
                  <Plus className="text-gray-400" />
               </div>
           </div>
        </div>

        {/* Cursors */}
        <motion.div
          animate={{ x: [400, 350, 400], y: [300, 250, 300] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        >
           <Cursor name="Yasmin" color="#8B5CF6" x={-100} y={0} message="Editing logic..." />
        </motion.div>

        <motion.div
          animate={{ x: [100, 150, 100], y: [100, 120, 100] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        >
           <Cursor name="Jordan" color="#10B981" x={0} y={0} />
        </motion.div>
      </div>
    </div>
  );
};
