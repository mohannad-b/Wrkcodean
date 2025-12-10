import React from 'react';
import { motion } from 'motion/react';
import { Cursor } from './Cursor';
import { 
  Activity, 
  CheckCircle, 
  Play, 
  Clock, 
  MoreHorizontal,
  ArrowUpRight,
  BarChart3,
  GitBranch,
  ShieldCheck
} from 'lucide-react';

export const CardLaunchDashboard = () => {
  return (
    <div className="w-full h-full relative flex items-center justify-center p-8">
      
      {/* Main Dashboard Card */}
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col z-10 relative">
         
         {/* Header */}
         <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6 bg-white">
            <div>
               <h3 className="text-lg font-bold text-gray-900">Vendor Onboarding</h3>
               <div className="flex items-center gap-2 mt-0.5">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Live & Healthy</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-xs text-gray-500">v2.1.0</span>
               </div>
            </div>
            <div className="flex gap-3">
               <button className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-50 transition-colors flex items-center gap-2">
                  <Clock size={14} /> History
               </button>
               <button className="px-3 py-1.5 rounded-lg bg-[#E43632] text-white text-xs font-bold hover:bg-[#C12E2A] transition-colors shadow-sm shadow-red-500/20 flex items-center gap-2">
                  <Play size={14} fill="currentColor" /> Run Now
               </button>
            </div>
         </div>

         {/* Stats Row */}
         <div className="grid grid-cols-3 border-b border-gray-100 divide-x divide-gray-100 bg-gray-50/50">
            <div className="p-5">
               <div className="text-xs text-gray-500 font-medium mb-1">Total Runs</div>
               <div className="text-2xl font-bold text-gray-900">1,248</div>
               <div className="text-[10px] text-emerald-600 flex items-center gap-1 mt-1 font-medium">
                  <ArrowUpRight size={10} /> +12% this week
               </div>
            </div>
            <div className="p-5">
               <div className="text-xs text-gray-500 font-medium mb-1">Success Rate</div>
               <div className="text-2xl font-bold text-gray-900">99.9%</div>
               <div className="text-[10px] text-gray-400 mt-1">Last 30 days</div>
            </div>
            <div className="p-5">
               <div className="text-xs text-gray-500 font-medium mb-1">Avg Duration</div>
               <div className="text-2xl font-bold text-gray-900">4.2s</div>
               <div className="text-[10px] text-emerald-600 flex items-center gap-1 mt-1 font-medium">
                  <ArrowUpRight size={10} /> -0.5s faster
               </div>
            </div>
         </div>

         {/* Runs List */}
         <div className="p-0 bg-white min-h-[300px]">
            {[1, 2, 3, 4].map((i) => (
               <div key={i} className="flex items-center justify-between p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors group cursor-pointer">
                  <div className="flex items-center gap-4">
                     <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
                        <CheckCircle size={16} />
                     </div>
                     <div>
                        <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                           Run #{2440 + i}
                           {i === 1 && <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] rounded border border-blue-100 font-bold">NEW</span>}
                        </div>
                        <div className="text-xs text-gray-500">Triggered by email from vendor-{i}@acme.com</div>
                     </div>
                  </div>
                  <div className="flex items-center gap-6">
                     <div className="text-right">
                        <div className="text-xs font-bold text-gray-900">4.2s</div>
                        <div className="text-[10px] text-gray-400">1 min ago</div>
                     </div>
                     <MoreHorizontal size={16} className="text-gray-300 group-hover:text-gray-600" />
                  </div>
               </div>
            ))}
         </div>
      </div>

      {/* Floating Panels */}
      
      {/* Approvals Panel */}
      <motion.div 
         animate={{ y: [0, -10, 0] }}
         transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
         className="absolute -right-12 top-20 bg-white p-4 rounded-xl shadow-xl border border-gray-100 w-48 z-20"
      >
         <div className="flex items-center gap-2 mb-3 border-b border-gray-100 pb-2">
            <ShieldCheck size={14} className="text-blue-600" />
            <span className="text-xs font-bold text-gray-900">Approvals</span>
         </div>
         <div className="space-y-3">
            <div className="flex items-center gap-2">
               <div className="w-6 h-6 rounded-full bg-gray-100 overflow-hidden"><img src="https://i.pravatar.cc/100?img=8" alt="" /></div>
               <div className="flex-1">
                  <div className="text-[10px] font-bold">Mo approved</div>
                  <div className="text-[9px] text-gray-400">2 mins ago</div>
               </div>
               <CheckCircle size={12} className="text-emerald-500" />
            </div>
         </div>
      </motion.div>

      {/* Versions Panel */}
      <motion.div 
         animate={{ y: [0, 8, 0] }}
         transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
         className="absolute -left-8 bottom-24 bg-white p-4 rounded-xl shadow-xl border border-gray-100 w-48 z-20"
      >
         <div className="flex items-center gap-2 mb-3 border-b border-gray-100 pb-2">
            <GitBranch size={14} className="text-purple-600" />
            <span className="text-xs font-bold text-gray-900">Versions</span>
         </div>
         <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px] bg-purple-50 p-2 rounded-lg border border-purple-100">
               <span className="font-bold text-purple-700">v2.1.0 (Live)</span>
               <span className="text-purple-400">Now</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-gray-400 px-2">
               <span>v2.0.9</span>
               <span>2h ago</span>
            </div>
         </div>
      </motion.div>

      {/* Cursor */}
      <motion.div
         animate={{ x: [200, 150, 200], y: [200, 250, 200] }}
         transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      >
         <Cursor name="Francis" color="#F59E0B" x={-100} y={-50} />
      </motion.div>

    </div>
  );
};
