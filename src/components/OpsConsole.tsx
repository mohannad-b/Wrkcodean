import React, { useState } from 'react';
import { Building2, LayoutGrid, FileText, Settings, LogOut, Bell, Users } from 'lucide-react';
import { OpsProjects } from './OpsProjects';
import { OpsClients } from './OpsClients';
import { cn } from '../lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

type ConsoleView = 'clients' | 'projects' | 'settings';

export const OpsConsole: React.FC = () => {
  const [currentView, setCurrentView] = useState<ConsoleView>('clients');

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-[#1A1A1A]">
      
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-64 bg-[#0A0A0A] text-white flex flex-col shrink-0 z-20">
        
        {/* Brand */}
        <div className="h-16 flex items-center px-6 border-b border-gray-800">
           <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#E43632] rounded flex items-center justify-center font-bold text-white text-sm">W</div>
              <span className="font-bold text-lg tracking-tight">WRK Ops</span>
           </div>
        </div>

        {/* Main Nav */}
        <nav className="flex-1 py-6 px-3 space-y-1">
           <button 
              onClick={() => setCurrentView('clients')}
              className={cn(
                 "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                 currentView === 'clients' ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800/50"
              )}
           >
              <Users size={18} /> Clients
           </button>
           <button 
              onClick={() => setCurrentView('projects')}
              className={cn(
                 "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                 currentView === 'projects' ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800/50"
              )}
           >
              <LayoutGrid size={18} /> Projects
           </button>
        </nav>

        {/* Footer User */}
        <div className="p-4 border-t border-gray-800">
           <div className="flex items-center gap-3">
              <Avatar className="w-8 h-8 border border-gray-700">
                 <AvatarImage src="https://github.com/shadcn.png" />
                 <AvatarFallback>SC</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                 <p className="text-sm font-bold text-white truncate">Sarah Connor</p>
                 <p className="text-xs text-gray-500 truncate">Head of Ops</p>
              </div>
              <Bell size={16} className="text-gray-500 hover:text-white cursor-pointer" />
           </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
         {currentView === 'clients' && <OpsClients />}
         {currentView === 'projects' && <OpsProjects />}
      </main>

    </div>
  );
};
