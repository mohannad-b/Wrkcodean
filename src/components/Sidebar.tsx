import { 
  LayoutDashboard, 
  Workflow, 
  CheckSquare, 
  Users, 
  Settings, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Server,
  CreditCard,
  UserCog,
  Building2
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { currentUser } from '../data';
import { cn } from '../lib/utils';
import { WrkLogo } from './WrkLogo';

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
  activeView?: string;
  onNavigate?: (view: string) => void;
}

const navItems = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'automations', icon: Workflow, label: 'Automations' },
  { id: 'tasks', icon: CheckSquare, label: 'Tasks' },
  { id: 'messages', icon: MessageSquare, label: 'Messages' },
  { id: 'workspace-settings', icon: Building2, label: 'Workspace Settings' },
  { id: 'team', icon: Users, label: 'Team' },
  { id: 'user-settings', icon: UserCog, label: 'User Settings' },
];

export const Sidebar: React.FC<SidebarProps> = ({ 
  collapsed = false, 
  onToggle,
  activeView = 'blueprints',
  onNavigate
}) => {
  return (
    <div className={cn(
      "hidden md:flex flex-col bg-[#0A0A0A] h-screen text-white fixed left-0 top-0 z-50 border-r border-white/5 transition-all duration-300 ease-in-out",
      collapsed ? "w-[48px]" : "w-64"
    )}>
      {/* Logo Area */}
      <div className={cn(
        "flex items-center transition-all duration-300 relative",
        collapsed ? "px-0 py-4 justify-center" : "p-6 pb-8"
      )}>
        <div className={cn(
          "transition-transform duration-300", 
          collapsed ? "origin-center scale-[0.45]" : "origin-left scale-75"
        )}>
            <WrkLogo />
        </div>
        
        {/* Expand/Collapse Button */}
        <button 
          onClick={onToggle}
          className={cn(
            "absolute -right-3 top-9 bg-[#0A0A0A] border border-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:border-white/30 hover:bg-white/5 transition-all shadow-lg z-50",
            "w-6 h-6"
          )}
        >
           {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
      
      {/* Extra toggle target for collapsed state */}
      {collapsed && (
        <button 
          onClick={onToggle}
          className="absolute right-0 top-0 bottom-0 w-4 cursor-col-resize hover:bg-white/5 z-40"
          title="Expand Sidebar"
        />
      )}

      {/* Navigation */}
      <nav className={cn(
        "flex-1 space-y-1 overflow-y-auto py-2",
        collapsed ? "px-1" : "px-3"
      )}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeView;
          return (
            <button
              key={item.label}
              onClick={() => onNavigate?.(item.id)}
              className={cn(
                "flex items-center transition-all duration-200 text-sm font-medium group relative",
                collapsed 
                  ? "justify-center w-full p-2 rounded-lg" 
                  : "gap-3 w-full px-3 py-2.5 rounded-lg",
                isActive 
                  ? "bg-[#E43632] text-white shadow-[0_0_15px_rgba(228,54,50,0.3)]" 
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className={cn("transition-colors", isActive ? "text-white" : "text-gray-500 group-hover:text-white")} />
              {!collapsed && item.label}
              {isActive && (
                <div className={cn(
                  "absolute top-1/2 -translate-y-1/2 bg-white/20 rounded-r-full",
                  collapsed ? "left-0 w-0.5 h-4" : "left-0 w-1 h-6"
                )} />
              )}
            </button>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className={cn(
        "mt-auto border-t border-white/10 mb-2",
        collapsed ? "p-1 mx-1" : "p-4 mx-2"
      )}>
        <div 
          onClick={() => onNavigate?.('user-settings')}
          className={cn(
            "flex items-center group cursor-pointer rounded-lg hover:bg-white/5 transition-colors",
            collapsed ? "justify-center p-1" : "gap-3 p-2",
            activeView === 'user-settings' ? "bg-white/10" : ""
          )}
        >
          <Avatar className="w-8 h-8 border border-white/20 group-hover:border-white/40 transition-colors">
            <AvatarImage src={currentUser.avatar} alt={currentUser.name} />
            <AvatarFallback>AM</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-white truncate">{currentUser.name}</p>
                <p className="text-[11px] text-gray-500 truncate group-hover:text-gray-400">Engineering Lead</p>
              </div>
              <LogOut size={14} className="text-gray-500 group-hover:text-white transition-colors" />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
