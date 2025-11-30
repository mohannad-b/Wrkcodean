import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  Plus, 
  LayoutGrid, 
  List as ListIcon, 
  MoreHorizontal, 
  Zap, 
  Clock, 
  TrendingUp, 
  AlertTriangle,
  FileText,
  CheckCircle2,
  MoreVertical,
  ArrowRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from './ui/dropdown-menu';
import { Progress } from './ui/progress';
import { cn } from '../lib/utils';
import { currentUser } from '../data';

// Mock Data
const AUTOMATIONS = [
  { 
    id: '1', 
    name: 'Invoice Processing', 
    description: 'Extracts data from PDF invoices and syncs to Xero.',
    department: 'Finance',
    owner: currentUser,
    version: 'v2.4', 
    status: 'Live', 
    runs: 1240, 
    success: 98.5, 
    spend: 450, 
    updated: '2 hours ago'
  },
  { 
    id: '2', 
    name: 'Employee Onboarding', 
    description: 'Provisions accounts across Slack, Jira, and Google Workspace.',
    department: 'HR',
    owner: { name: 'Sarah Chen', avatar: 'https://github.com/shadcn.png' },
    version: 'v1.1', 
    status: 'Build in Progress', 
    progress: 65,
    runs: 0, 
    success: 0, 
    spend: 0, 
    updated: '1 day ago'
  },
  { 
    id: '3', 
    name: 'Sales Lead Routing', 
    description: 'Enriches leads from Typeform and assigns to Account Execs.',
    department: 'Sales',
    owner: { name: 'Mike Ross', avatar: '' },
    version: 'v3.0', 
    status: 'Awaiting Client Approval', 
    runs: 850, 
    success: 99.1, 
    spend: 210, 
    updated: '3 days ago'
  },
  { 
    id: '4', 
    name: 'Legal Document Review', 
    description: 'First-pass review of NDAs using GPT-4.',
    department: 'Legal',
    owner: currentUser,
    version: 'v1.0', 
    status: 'Blocked', 
    runs: 45, 
    success: 82.0, 
    spend: 85, 
    updated: '5 hours ago'
  },
  { 
    id: '5', 
    name: 'Customer Support Triaging', 
    description: 'Classifies incoming tickets and suggests responses.',
    department: 'Support',
    owner: { name: 'Jessica Pearson', avatar: '' },
    version: 'v0.9', 
    status: 'Intake in Progress', 
    runs: 0, 
    success: 0, 
    spend: 0, 
    updated: '1 week ago'
  }
];

interface AutomationsListProps {
  onSelectAutomation: (id: string) => void;
  onCreateAutomation: () => void;
  onAction: (action: string, id: string) => void;
}

export const AutomationsList: React.FC<AutomationsListProps> = ({ onSelectAutomation, onCreateAutomation, onAction }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter Logic
  const filteredAutomations = AUTOMATIONS.filter(auto => {
    if (filter !== 'all' && auto.status !== filter) return false;
    if (searchQuery && !auto.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Live': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Ready to Launch': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'QA & Testing': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Build in Progress': return 'bg-red-50 text-[#E43632] border-red-200';
      case 'Awaiting Client Approval': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Needs Pricing': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Intake in Progress': return 'bg-gray-50 text-gray-600 border-gray-200';
      case 'Blocked': return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Archived': return 'bg-gray-100 text-gray-500 border-gray-200';
      default: return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50/50">
      <div className="max-w-[1600px] mx-auto p-6 md:p-10 space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#0A0A0A] tracking-tight mb-1">
              Automations
            </h1>
            <p className="text-gray-500 text-sm font-medium">
              Manage your organization's workflows and bots.
            </p>
          </div>
          <div className="flex items-center gap-3">
             <Button onClick={onCreateAutomation} className="bg-[#E43632] hover:bg-[#C12E2A] text-white shadow-lg shadow-red-500/20 font-semibold">
               <Plus className="mr-2 h-4 w-4" />
               New Automation
             </Button>
          </div>
        </div>

        {/* Controls & Filters */}
        <div className="space-y-4">
           <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
              {/* Search & Primary Filter */}
              <div className="flex items-center gap-3 w-full md:w-auto">
                 <div className="relative flex-1 md:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input 
                      placeholder="Search automations..." 
                      className="pl-9 bg-white border-gray-200 focus-visible:ring-[#E43632]"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                 </div>
                 <Button variant="outline" size="icon" className="shrink-0 bg-white border-gray-200">
                    <Filter size={16} className="text-gray-500" />
                 </Button>
              </div>

              {/* View Toggle */}
              <div className="bg-white border border-gray-200 rounded-lg p-1 flex items-center gap-1">
                 <button 
                    onClick={() => setViewMode('grid')}
                    className={cn(
                       "p-1.5 rounded-md transition-all",
                       viewMode === 'grid' ? "bg-gray-100 text-[#0A0A0A] shadow-sm" : "text-gray-400 hover:text-gray-600"
                    )}
                 >
                    <LayoutGrid size={16} />
                 </button>
                 <button 
                    onClick={() => setViewMode('list')}
                    className={cn(
                       "p-1.5 rounded-md transition-all",
                       viewMode === 'list' ? "bg-gray-100 text-[#0A0A0A] shadow-sm" : "text-gray-400 hover:text-gray-600"
                    )}
                 >
                    <ListIcon size={16} />
                 </button>
              </div>
           </div>

           {/* Chip Filters */}
           <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {['all', 'Live', 'Build in Progress', 'Needs Pricing', 'Intake in Progress', 'Blocked'].map((chip) => (
                 <button
                    key={chip}
                    onClick={() => setFilter(chip)}
                    className={cn(
                       "px-3 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap",
                       filter === chip 
                          ? "bg-[#0A0A0A] text-white border-[#0A0A0A]" 
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    )}
                 >
                    {chip === 'all' ? 'All Automations' : chip}
                 </button>
              ))}
           </div>
        </div>

        {/* Content Area */}
        {filteredAutomations.length === 0 ? (
           <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-dashed border-gray-200">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                 <Zap size={24} className="text-gray-300" />
              </div>
              <h3 className="text-lg font-bold text-[#0A0A0A] mb-1">No automations found</h3>
              <p className="text-sm text-gray-500 max-w-xs mb-6">
                 {searchQuery ? "Try adjusting your search or filters." : "Get started by creating your first automation or importing a process."}
              </p>
              <Button onClick={onCreateAutomation} className="bg-[#E43632] hover:bg-[#C12E2A] text-white">
                 Create Automation
              </Button>
           </div>
        ) : (
           <div className={cn(
              "grid gap-6",
              viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-1"
           )}>
              {filteredAutomations.map((auto) => (
                 viewMode === 'grid' ? (
                    // GRID CARD
                    <motion.div 
                       key={auto.id}
                       layout
                       initial={{ opacity: 0, scale: 0.95 }}
                       animate={{ opacity: 1, scale: 1 }}
                       onClick={() => onSelectAutomation(auto.id)}
                       className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all group flex flex-col cursor-pointer"
                    >
                       <div className="p-6 flex-1">
                          <div className="flex justify-between items-start mb-4">
                             <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500">
                                   <Zap size={20} />
                                </div>
                                <div>
                                   <h3 className="font-bold text-[#0A0A0A] leading-tight mb-0.5">{auto.name}</h3>
                                   <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-[10px] px-1.5 h-5 text-gray-500 border-gray-200">{auto.version}</Badge>
                                      <span className="text-xs text-gray-400">{auto.department}</span>
                                   </div>
                                </div>
                             </div>
                             <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                   <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-[#0A0A0A]">
                                      <MoreHorizontal size={16} />
                                   </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                   <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('rename', auto.id); }}>Rename</DropdownMenuItem>
                                   <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('clone', auto.id); }}>Clone</DropdownMenuItem>
                                   <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onAction('pause', auto.id); }}>Pause</DropdownMenuItem>
                                   <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); onAction('archive', auto.id); }}>Archive</DropdownMenuItem>
                                </DropdownMenuContent>
                             </DropdownMenu>
                          </div>
                          
                          <p className="text-xs text-gray-500 line-clamp-2 mb-4 h-8">
                             {auto.description}
                          </p>

                          {/* Status & Build Tracker */}
                          <div className="mb-6">
                             {auto.status === 'Build in Progress' ? (
                                <div className="space-y-2">
                                   <div className="flex justify-between text-xs font-medium text-gray-600">
                                      <span className="flex items-center gap-1.5 text-[#E43632]"><Clock size={12} /> Build in Progress</span>
                                      <span>{auto.progress}%</span>
                                   </div>
                                   <Progress value={auto.progress} className="h-1.5 bg-gray-100" indicatorClassName="bg-[#E43632]" />
                                </div>
                             ) : (
                                <Badge variant="outline" className={cn("text-xs font-medium border px-2.5 py-0.5", getStatusColor(auto.status))}>
                                   {auto.status}
                                </Badge>
                             )}
                          </div>

                          {/* Stats Row */}
                          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-50">
                             <div>
                                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">Runs</p>
                                <p className="text-sm font-bold text-[#0A0A0A]">{auto.runs > 0 ? auto.runs : '-'}</p>
                             </div>
                             <div>
                                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">Success</p>
                                <p className={cn("text-sm font-bold", auto.success > 90 ? "text-emerald-600" : "text-gray-600")}>
                                   {auto.success > 0 ? `${auto.success}%` : '-'}
                                </p>
                             </div>
                             <div>
                                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-0.5">Spend</p>
                                <p className="text-sm font-bold text-[#0A0A0A]">{auto.spend > 0 ? `$${auto.spend}` : '-'}</p>
                             </div>
                          </div>
                       </div>

                       {/* Footer */}
                       <div className="bg-gray-50 p-3 px-6 rounded-b-xl border-t border-gray-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                             <Avatar className="w-5 h-5 border border-white shadow-sm">
                                <AvatarImage src={auto.owner.avatar} />
                                <AvatarFallback className="text-[9px] bg-gray-200">{auto.owner.name?.charAt(0) || 'U'}</AvatarFallback>
                             </Avatar>
                             <span className="text-[10px] text-gray-500 font-medium">{auto.owner.name}</span>
                          </div>
                          <Button 
                             size="sm" 
                             variant="ghost" 
                             onClick={() => onSelectAutomation(auto.id)}
                             className="text-xs font-bold text-[#0A0A0A] hover:text-[#E43632] hover:bg-transparent p-0 h-auto"
                          >
                             Open <ArrowRight size={12} className="ml-1" />
                          </Button>
                       </div>
                    </motion.div>
                 ) : (
                    // LIST VIEW ROW
                    <motion.div 
                       key={auto.id}
                       layout
                       initial={{ opacity: 0 }}
                       animate={{ opacity: 1 }}
                       onClick={() => onSelectAutomation(auto.id)}
                       className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-6 hover:border-gray-300 transition-all cursor-pointer group"
                    >
                       <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-500 shrink-0">
                          <Zap size={20} />
                       </div>
                       
                       <div className="flex-1 min-w-[200px]">
                          <h3 className="font-bold text-[#0A0A0A] text-sm mb-0.5 group-hover:text-[#E43632] transition-colors">{auto.name}</h3>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                             <span>{auto.version}</span>
                             <span className="w-1 h-1 rounded-full bg-gray-300" />
                             <span>{auto.department}</span>
                          </div>
                       </div>

                       <div className="w-[140px] shrink-0">
                          <div className="flex items-center gap-2">
                             <Avatar className="w-5 h-5">
                                <AvatarImage src={auto.owner.avatar} />
                                <AvatarFallback className="text-[9px] bg-gray-100">{auto.owner.name?.charAt(0)}</AvatarFallback>
                             </Avatar>
                             <span className="text-xs text-gray-600 truncate">{auto.owner.name}</span>
                          </div>
                       </div>

                       <div className="w-[120px] shrink-0">
                          <Badge variant="outline" className={cn("text-[10px] font-medium border px-2 py-0.5", getStatusColor(auto.status))}>
                             {auto.status}
                          </Badge>
                       </div>

                       <div className="w-[100px] shrink-0 text-right">
                          <p className="text-xs font-bold text-[#0A0A0A]">{auto.runs > 0 ? auto.runs : '-'}</p>
                          <p className="text-[10px] text-gray-400">runs</p>
                       </div>

                       <div className="w-[100px] shrink-0 text-right">
                          <p className="text-xs font-bold text-[#0A0A0A]">{auto.spend > 0 ? `$${auto.spend}` : '-'}</p>
                          <p className="text-[10px] text-gray-400">spend</p>
                       </div>

                       <div className="w-8 shrink-0 text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-[#0A0A0A]" onClick={(e) => e.stopPropagation()}>
                             <MoreVertical size={16} />
                          </Button>
                       </div>
                    </motion.div>
                 )
              ))}
           </div>
        )}
      </div>
    </div>
  );
};
