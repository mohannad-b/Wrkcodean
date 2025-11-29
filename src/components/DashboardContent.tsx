import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Zap,
  TrendingUp,
  MoreHorizontal,
  Play,
  Users,
  Link as LinkIcon,
  Sparkles,
  ChevronDown,
  FileText,
  AlertCircle,
  X,
  Briefcase,
  Rocket
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Progress } from './ui/progress';
import { cn } from '../lib/utils';
import { currentUser } from '../data';

// --- Mock Data ---

const TASKS = [
  { id: 1, type: 'approval', title: 'Approve Invoice Processing v2.1', due: 'Today', priority: 'high' },
  { id: 2, type: 'review', title: 'Review Employee Onboarding Logic', due: 'Tomorrow', priority: 'medium' },
  { id: 3, type: 'missing_info', title: 'Missing credentials for Salesforce', due: 'Overdue', priority: 'critical' },
];

const AUTOMATIONS = [
  { 
    id: '1', 
    name: 'Invoice Processing', 
    version: 'v2.4', 
    status: 'Live', 
    runs: 1240, 
    success: 98.5, 
    spend: 450, 
    trend: '+12%',
    needsApproval: false
  },
  { 
    id: '2', 
    name: 'Employee Onboarding', 
    version: 'v1.1', 
    status: 'Build in Progress', 
    progress: 65,
    runs: 0, 
    success: 0, 
    spend: 0, 
    trend: 'New',
    needsApproval: false
  },
  { 
    id: '3', 
    name: 'Sales Lead Routing', 
    version: 'v3.0', 
    status: 'Awaiting Client Approval', 
    runs: 850, 
    success: 99.1, 
    spend: 210, 
    trend: '-5%',
    needsApproval: true
  },
  { 
    id: '4', 
    name: 'Legal Document Review', 
    version: 'v1.0', 
    status: 'Blocked', 
    runs: 45, 
    success: 82.0, 
    spend: 85, 
    trend: '+2%',
    needsApproval: false
  }
];

const USAGE_DATA = Array.from({ length: 30 }, (_, i) => ({
  day: i + 1,
  units: Math.floor(Math.random() * 500) + 100,
}));

const ACTIVITY_FEED = [
  { id: 1, user: 'Sarah Chen', avatar: 'https://github.com/shadcn.png', action: 'deployed', target: 'Invoice Processing v2.4', time: '10m ago' },
  { id: 2, user: 'Mike Ross', avatar: '', action: 'requested_changes', target: 'Sales Lead Routing', time: '1h ago' },
  { id: 3, user: 'System', avatar: '', action: 'alert', target: 'High error rate detected in Doc Review', time: '2h ago' },
  { id: 4, user: 'Jessica Pearson', avatar: '', action: 'commented', target: 'Quote #1023', time: '4h ago' },
];

const AI_INSIGHTS = [
  { id: 1, title: 'Optimize Approval Steps', desc: 'Invoice Processing approval time is 20% higher than average. Consider adding auto-approval for <$500.', type: 'efficiency' },
  { id: 2, title: 'Volume Spike Predicted', desc: 'End of month processing typically spikes by 300% next week. Check credit limits.', type: 'volume' },
];

interface DashboardContentProps {
  onCreateAutomation?: () => void;
  onInvite?: () => void;
  onStartOnboarding?: () => void;
  onNavigate?: (view: string) => void;
}

export const DashboardContent: React.FC<DashboardContentProps> = ({ onCreateAutomation, onInvite, onStartOnboarding, onNavigate }) => {
  const [showAlert, setShowAlert] = useState(true);

  return (
    <div className="flex-1 h-full overflow-y-auto bg-gray-50/50">
      <div className="max-w-[1600px] mx-auto p-6 md:p-8 lg:p-12 space-y-8">
        
        {/* 1. Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 text-gray-500 mb-1">
               <Briefcase size={16} />
               <span className="text-sm font-medium">Acme Corp</span>
               <ChevronDown size={14} className="cursor-pointer hover:text-black transition-colors" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#0A0A0A] tracking-tight">
              Good afternoon, {currentUser.name.split(' ')[0]}
            </h1>
          </div>
          
          <div className="flex items-center gap-3">
                  {/* DEMO BUTTON REMOVED */}
                  <Button onClick={onCreateAutomation} className="bg-[#E43632] hover:bg-[#C12E2A] text-white shadow-lg shadow-red-500/20 font-bold">
                    <Plus className="mr-2 h-4 w-4" />
                    New Automation
                  </Button>
          </div>
        </header>

        {/* 2. Alert Bar */}
        <AnimatePresence>
          {showAlert && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
               <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg text-amber-600 shrink-0">
                     <AlertTriangle size={20} />
                  </div>
                  <div>
                     <h3 className="font-bold text-amber-900 text-sm">Action Required: Payment Method Expiring</h3>
                     <p className="text-xs text-amber-700 mt-0.5">Your primary card ending in 4242 expires in 3 days. Update now to avoid service interruption.</p>
                  </div>
               </div>
               <div className="flex items-center gap-3 w-full sm:w-auto">
                  <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white border-none w-full sm:w-auto">Update Payment</Button>
                  <Button variant="ghost" size="icon" onClick={() => setShowAlert(false)} className="text-amber-700 hover:bg-amber-100 hidden sm:flex">
                     <X size={16} />
                  </Button>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN (2/3 width on large screens) */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* 3. My Tasks */}
            <section>
               <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-[#0A0A0A]">My Tasks</h2>
                  <Button variant="link" onClick={() => onNavigate?.('tasks')} className="text-[#E43632] text-xs font-bold h-auto p-0">View All</Button>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {TASKS.map((task) => (
                     <div key={task.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer group relative overflow-hidden">
                        <div className={cn(
                           "absolute top-0 left-0 w-1 h-full",
                           task.priority === 'critical' ? 'bg-red-500' : task.priority === 'high' ? 'bg-orange-500' : 'bg-blue-500'
                        )} />
                        <div className="flex justify-between items-start mb-3">
                           <Badge variant="secondary" className={cn(
                              "text-[10px] font-bold uppercase tracking-wider",
                              task.type === 'approval' ? 'bg-emerald-50 text-emerald-700' : 
                              task.type === 'review' ? 'bg-blue-50 text-blue-700' : 
                              'bg-red-50 text-red-700'
                           )}>
                              {task.type.replace('_', ' ')}
                           </Badge>
                           <span className={cn(
                              "text-xs font-bold",
                              task.due === 'Overdue' ? 'text-red-600' : 'text-gray-400'
                           )}>{task.due}</span>
                        </div>
                        <h3 className="text-sm font-bold text-[#0A0A0A] mb-4 line-clamp-2 leading-relaxed">
                           {task.title}
                        </h3>
                        <div className="flex items-center justify-end">
                           <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-[#E43632] transition-colors">
                              <ArrowRight size={14} className="text-gray-400 group-hover:text-white" />
                           </div>
                        </div>
                     </div>
                  ))}
               </div>
            </section>

            {/* 4. Active Automations Grid */}
            <section>
               <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-[#0A0A0A] cursor-pointer hover:text-[#E43632] transition-colors" onClick={() => onNavigate?.('automations')}>Active Automations</h2>
                  <div className="flex items-center gap-2">
                     <Button variant="ghost" size="sm" className="text-gray-500"><Filter size={16} /></Button>
                     <Button variant="ghost" size="sm" className="text-gray-500"><Search size={16} /></Button>
                  </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {AUTOMATIONS.map((auto) => (
                     <div key={auto.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:border-gray-300 transition-colors relative">
                        
                        {auto.needsApproval && (
                           <div className="absolute -top-3 right-4">
                              <Badge className="bg-[#E43632] hover:bg-[#C12E2A] text-white shadow-md border-none px-3 py-1">
                                 Action: Review Quote
                              </Badge>
                           </div>
                        )}

                        <div className="flex justify-between items-start mb-4">
                           <div className="flex items-center gap-3">
                              <div className={cn(
                                 "w-10 h-10 rounded-lg flex items-center justify-center border",
                                 auto.status === 'exception' ? "bg-red-50 border-red-100 text-red-600" : "bg-gray-50 border-gray-100 text-gray-600"
                              )}>
                                 <Zap size={20} />
                              </div>
                              <div>
                                 <h3 className="font-bold text-[#0A0A0A]">{auto.name}</h3>
                                 <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-gray-50 text-gray-500 border-gray-200">{auto.version}</Badge>
                                    <span className={cn(
                                       "text-[10px] font-medium flex items-center gap-1",
                                       auto.status === 'Live' ? 'text-emerald-600' :
                                       auto.status === 'Build in Progress' ? 'text-[#E43632]' :
                                       auto.status === 'Blocked' ? 'text-orange-600' : 
                                       auto.status === 'Awaiting Client Approval' ? 'text-blue-600' :
                                       'text-gray-600'
                                    )}>
                                       <div className={cn("w-1.5 h-1.5 rounded-full", 
                                          auto.status === 'Live' ? 'bg-emerald-500' :
                                          auto.status === 'Build in Progress' ? 'bg-[#E43632]' :
                                          auto.status === 'Blocked' ? 'bg-orange-500' : 
                                          auto.status === 'Awaiting Client Approval' ? 'bg-blue-500' :
                                          'bg-gray-400'
                                       )} />
                                       {auto.status}
                                    </span>
                                 </div>
                              </div>
                           </div>
                           <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400">
                              <MoreHorizontal size={16} />
                           </Button>
                        </div>

                        {auto.status === 'Build in Progress' ? (
                           <div className="space-y-2 mt-6 mb-2">
                              <div className="flex justify-between text-xs font-medium text-gray-500">
                                 <span>Build in Progress</span>
                                 <span>{auto.progress}%</span>
                              </div>
                              <Progress value={auto.progress} className="h-2 bg-gray-100" indicatorClassName="bg-[#E43632]" />
                           </div>
                        ) : (
                           <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-50">
                              <div>
                                 <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Runs (30d)</p>
                                 <p className="text-lg font-bold text-[#0A0A0A]">{auto.runs}</p>
                              </div>
                              <div>
                                 <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Success</p>
                                 <p className={cn("text-lg font-bold", auto.success < 99 ? "text-amber-600" : "text-emerald-600")}>
                                    {auto.success}%
                                 </p>
                              </div>
                              <div>
                                 <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">Spend</p>
                                 <p className="text-lg font-bold text-[#0A0A0A]">${auto.spend}</p>
                              </div>
                           </div>
                        )}
                     </div>
                  ))}
                  
                  {/* Create New Card */}
                  <button onClick={onCreateAutomation} className="group border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center text-center hover:border-[#E43632]/40 hover:bg-[#E43632]/5 transition-all min-h-[200px]">
                     <div className="w-12 h-12 rounded-full bg-gray-50 group-hover:bg-white flex items-center justify-center mb-4 group-hover:shadow-md transition-all">
                        <Plus className="text-gray-400 group-hover:text-[#E43632]" />
                     </div>
                     <h3 className="font-bold text-gray-900 mb-1">Create New Automation</h3>
                  </button>
               </div>
            </section>

            {/* 5. Usage & Spend Overview */}
            <section>
               <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-[#0A0A0A]">Usage & Spend</h2>
                  <Select defaultValue="30d">
                     <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="7d">Last 7 Days</SelectItem>
                        <SelectItem value="30d">Last 30 Days</SelectItem>
                     </SelectContent>
                  </Select>
               </div>
               <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <div className="h-[250px] w-full mb-6">
                     <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                        <AreaChart data={USAGE_DATA}>
                           <defs>
                              <linearGradient id="colorUnits" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#E43632" stopOpacity={0.1}/>
                                 <stop offset="95%" stopColor="#E43632" stopOpacity={0}/>
                              </linearGradient>
                           </defs>
                           <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                           <XAxis dataKey="day" axisLine={false} tickLine={false} fontSize={12} tick={{fill: '#9ca3af'}} />
                           <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{fill: '#9ca3af'}} />
                           <Tooltip 
                              contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} 
                              cursor={{stroke: '#E43632', strokeWidth: 1, strokeDasharray: '4 4'}}
                           />
                           <Area type="monotone" dataKey="units" stroke="#E43632" strokeWidth={2} fillOpacity={1} fill="url(#colorUnits)" />
                        </AreaChart>
                     </ResponsiveContainer>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 border-t border-gray-50 pt-6">
                     <div>
                        <p className="text-xs text-gray-500 mb-1">Total Spend (Oct)</p>
                        <p className="text-2xl font-bold text-[#0A0A0A]">$3,450</p>
                     </div>
                     <div>
                        <p className="text-xs text-gray-500 mb-1">Cost per Unit</p>
                        <p className="text-2xl font-bold text-[#0A0A0A]">$0.024</p>
                     </div>
                     <div>
                        <p className="text-xs text-gray-500 mb-1">Highest Volume</p>
                        <p className="text-sm font-bold text-[#0A0A0A] truncate">Invoice Processing</p>
                        <p className="text-[10px] text-gray-400">14.2k units</p>
                     </div>
                     <div>
                        <p className="text-xs text-gray-500 mb-1">Forecast (Nov)</p>
                        <p className="text-2xl font-bold text-gray-400">~$3,800</p>
                     </div>
                  </div>
               </div>
            </section>

          </div>

          {/* RIGHT COLUMN (1/3 width on large screens) */}
          <div className="space-y-8">
            
            {/* 6. Build Activity Feed */}
            <section>
               <h2 className="text-lg font-bold text-[#0A0A0A] mb-4">Build Activity</h2>
               <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="divide-y divide-gray-100">
                     {ACTIVITY_FEED.map((item) => (
                        <div key={item.id} className="p-4 flex gap-3 hover:bg-gray-50 transition-colors group">
                           <Avatar className="h-8 w-8 border border-gray-100">
                              <AvatarImage src={item.avatar} />
                              <AvatarFallback className="bg-gray-100 text-xs font-bold text-gray-500">
                                 {item.user.charAt(0)}
                              </AvatarFallback>
                           </Avatar>
                           <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-500 mb-0.5">
                                 <span className="font-bold text-[#0A0A0A]">{item.user}</span> {item.action.replace('_', ' ')}
                              </p>
                              <p className="text-xs font-medium text-[#0A0A0A] truncate mb-1">{item.target}</p>
                              <p className="text-[10px] text-gray-400">{item.time}</p>
                           </div>
                        </div>
                     ))}
                     <div className="p-2 text-center">
                        <Button variant="ghost" size="sm" className="text-xs text-gray-400 hover:text-[#0A0A0A] w-full">View All Activity</Button>
                     </div>
                  </div>
               </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
};
