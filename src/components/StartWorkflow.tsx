import React, { useState } from 'react';
import { 
  MessageSquarePlus, 
  UploadCloud, 
  AppWindow, 
  MonitorPlay, 
  LayoutTemplate,
  ArrowRight,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { WrkLogo } from './WrkLogo';
import { currentUser } from '../data';

interface StartOptionProps {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  onClick: () => void;
}

const StartOption: React.FC<StartOptionProps> = ({ icon: Icon, title, subtitle, onClick }) => (
  <motion.button
    whileHover={{ scale: 1.02, y: -2, borderColor: '#E43632' }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="flex flex-col items-start p-6 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-xl hover:shadow-red-500/10 transition-all duration-200 text-left group w-full h-full"
  >
    <div className="mb-4 p-3 bg-gray-50 rounded-lg group-hover:bg-[#E43632] transition-colors duration-300">
      <Icon size={24} className="text-gray-600 group-hover:text-white transition-colors duration-300" />
    </div>
    <h3 className="text-lg font-bold text-[#0A0A0A] mb-2 group-hover:text-[#E43632] transition-colors">
      {title}
    </h3>
    <p className="text-sm text-gray-500 leading-relaxed group-hover:text-gray-600">
      {subtitle}
    </p>
    <div className="mt-auto pt-6 flex items-center text-xs font-bold text-[#E43632] opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
      Select Option <ArrowRight size={14} className="ml-1" />
    </div>
  </motion.button>
);

export const StartWorkflow: React.FC = () => {
  const [hasStarted, setHasStarted] = useState(false);

  const handleStart = () => {
    setHasStarted(true);
  };

  return (
    <div className="relative w-full h-screen bg-[#F9FAFB] overflow-hidden flex flex-col">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-20 pointer-events-none">
         <div className="pointer-events-auto">
            <div className="scale-75 origin-top-left">
              <WrkLogo />
            </div>
         </div>
         
         <div className="flex items-center gap-3 pointer-events-auto">
            <div className="flex -space-x-2 mr-2">
               {[1, 2, 3].map((i) => (
                 <Avatar key={i} className="border-2 border-white w-8 h-8">
                    <AvatarFallback className="bg-gray-200 text-xs text-gray-500">U{i}</AvatarFallback>
                 </Avatar>
               ))}
               <Avatar className="border-2 border-white w-8 h-8">
                  <AvatarImage src={currentUser.avatar} />
                  <AvatarFallback>ME</AvatarFallback>
               </Avatar>
            </div>
            <button className="bg-[#E43632] text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-[#C12E2A] transition-colors">
               Share
            </button>
         </div>
      </div>

      {/* Canvas Background (Always visible, but obscured initially) */}
      <div className="absolute inset-0 z-0 grid-bg opacity-40" />
      
      {/* Canvas Empty State Indicators */}
      <AnimatePresence>
        {hasStarted && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ duration: 1 }}
            className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center"
          >
             <div className="grid grid-cols-3 gap-8 max-w-6xl w-full p-10 opacity-30">
                {[1, 2, 3].map((i) => (
                   <div key={i} className="border-2 border-dashed border-gray-400 rounded-2xl h-96 flex items-center justify-center">
                      <span className="text-gray-400 font-bold text-lg">Requirement Card Slot</span>
                   </div>
                ))}
             </div>
             <div className="absolute bottom-12 text-center">
                <p className="text-gray-400 font-medium animate-pulse">
                  Your Workflow Blueprint will build itself as you add information.
                </p>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Selection Modal */}
      <AnimatePresence>
        {!hasStarted && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
            className="relative z-30 flex flex-col items-center justify-center min-h-screen p-4"
          >
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-extrabold text-[#0A0A0A] tracking-tight mb-4">
                How would you like to start?
              </h1>
              <p className="text-xl text-gray-500 max-w-2xl mx-auto">
                Choose the best way to express your process, and we'll help you build the perfect automation.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 max-w-[1600px] w-full px-6">
              <StartOption 
                icon={MessageSquarePlus}
                title="Describe it"
                subtitle="Tell us what you want to automate and we’ll build the first draft."
                onClick={handleStart}
              />
              <StartOption 
                icon={UploadCloud}
                title="Upload materials"
                subtitle="Loom videos, screenshots, PDFs, emails, anything."
                onClick={handleStart}
              />
              <StartOption 
                icon={AppWindow}
                title="Pull from apps"
                subtitle="Connect apps like Salesforce, HubSpot, Zendesk, Netsuite."
                onClick={handleStart}
              />
              <StartOption 
                icon={MonitorPlay}
                title="Record screen"
                subtitle="Show us the workflow—AI will extract the steps."
                onClick={handleStart}
              />
              <StartOption 
                icon={LayoutTemplate}
                title="Start blank"
                subtitle="Build your workflow Blueprint manually from scratch."
                onClick={handleStart}
              />
            </div>

            <div className="mt-16 text-sm text-gray-400 font-medium flex items-center gap-2">
               <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
               AI Copilot is ready to assist you
            </div>

          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
