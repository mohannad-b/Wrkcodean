import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '../lib/utils';

interface SystemPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (system: string) => void;
}

const SYSTEMS = [
  { name: 'Slack', icon: '💬', desc: 'Messaging & Alerts', status: 'Connected' },
  { name: 'Gmail', icon: '✉️', desc: 'Email triggers', status: 'Connected' },
  { name: 'Xero', icon: '🔵', desc: 'Accounting & Invoices', status: 'Click to Connect' },
  { name: 'HubSpot', icon: '🟧', desc: 'CRM & Leads', status: 'Click to Connect' },
  { name: 'Zendesk', icon: '🎧', desc: 'Customer Support', status: 'Click to Connect' },
  { name: 'Google Drive', icon: '📁', desc: 'File Storage', status: 'Click to Connect' },
  { name: 'Salesforce', icon: '☁️', desc: 'Enterprise CRM', status: 'Click to Connect' },
  { name: 'NetSuite', icon: 'N', desc: 'ERP System', status: 'Click to Connect' },
];

export const SystemPickerModal: React.FC<SystemPickerModalProps> = ({ isOpen, onClose, onSelect }) => {
  const [connectingSys, setConnectingSys] = useState<string | null>(null);

  const handleSelect = (sysName: string) => {
    setConnectingSys(sysName);
    // Simulate OAuth delay
    setTimeout(() => {
      setConnectingSys(null);
      onSelect(sysName);
    }, 1500);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
          >
            
            {/* Connecting Overlay */}
            <AnimatePresence>
              {connectingSys && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center"
                >
                   <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center text-3xl shadow-lg mb-6 relative overflow-hidden">
                     {SYSTEMS.find(s => s.name === connectingSys)?.icon}
                     <div className="absolute bottom-0 left-0 h-1 bg-[#E43632] animate-[loading_1.5s_ease-in-out_infinite] w-full" />
                   </div>
                   <h3 className="text-lg font-bold text-[#0A0A0A]">Connecting to {connectingSys}...</h3>
                   <p className="text-gray-500 text-sm mt-1">Verifying credentials via OAuth</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Header */}
            <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white z-10">
              <div>
                <h3 className="font-bold text-xl text-[#0A0A0A]">Connect a System</h3>
                <p className="text-sm text-gray-500 mt-1">Select a platform to integrate with this workflow.</p>
              </div>
              <button onClick={onClose} className="text-gray-400 hover:text-[#0A0A0A] transition-colors bg-gray-50 hover:bg-gray-100 p-2 rounded-full">
                <X size={20} />
              </button>
            </div>

            {/* Search */}
            <div className="px-8 py-4 border-b border-gray-100 bg-white">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <Input 
                  placeholder="Search apps and integrations..." 
                  className="pl-11 h-12 bg-gray-50 border-transparent focus:bg-white focus:border-gray-200 focus-visible:ring-[#E43632] text-base rounded-xl transition-all"
                />
              </div>
            </div>

            {/* Grid */}
            <div className="p-8 overflow-y-auto bg-[#F9FAFB] custom-scrollbar">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {SYSTEMS.map((sys) => (
                  <button
                    key={sys.name}
                    onClick={() => handleSelect(sys.name)}
                    className="group relative flex flex-col items-start p-5 bg-white border border-gray-200 rounded-2xl hover:border-[#E43632]/30 hover:shadow-xl hover:shadow-red-500/5 transition-all text-left overflow-hidden"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform duration-300">
                      {sys.icon}
                    </div>
                    <div className="font-bold text-[#0A0A0A] text-base mb-0.5">{sys.name}</div>
                    <div className="text-xs text-gray-500 mb-3">{sys.desc}</div>
                    
                    <div className="flex items-center gap-1.5 mt-auto">
                       {sys.status === 'Connected' ? (
                         <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                           <CheckCircle2 size={10} /> Connected
                         </div>
                       ) : (
                         <div className="text-[10px] font-medium text-gray-400 group-hover:text-[#E43632] transition-colors flex items-center gap-1">
                           Click to Connect
                         </div>
                       )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-gray-100 bg-white text-center">
              <p className="text-xs text-gray-400">Don't see your tool? <span className="text-[#E43632] font-bold cursor-pointer hover:underline">Request an integration</span></p>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
