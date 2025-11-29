import React from 'react';
import { 
  Activity, 
  Clock, 
  DollarSign, 
  Zap, 
  CheckCircle2, 
  AlertTriangle, 
  Users, 
  Play, 
  Edit3, 
  Sparkles, 
  Calendar, 
  History,
  ArrowUpRight,
  ArrowRight,
  MoreHorizontal
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

interface OverviewTabProps {
  onEditBlueprint: () => void;
  onInvite: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ onEditBlueprint, onInvite }) => {
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 overflow-y-auto h-full pb-20">
      
      {/* 1. HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[#0A0A0A]">Finance Reconciliation</h1>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 rounded-full px-3 py-0.5 text-xs font-semibold tracking-wide uppercase">
              Live
            </Badge>
          </div>
          <p className="text-gray-500 max-w-2xl leading-relaxed text-sm">
            Automates the reconciliation of incoming invoices against purchase orders in Xero. 
            Triggers on email receipt, extracts data via AI, and creates draft bills for approval.
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-400 pt-1">
             <span className="flex items-center gap-1.5">
               <div className="w-2 h-2 rounded-full bg-blue-500" />
               v2.4 (Current)
             </span>
             <span className="w-1 h-1 rounded-full bg-gray-300" />
             <span className="flex items-center gap-1.5">
               <Calendar size={12} />
               Last updated 2 hours ago by <span className="text-gray-600 font-medium">Mo</span>
             </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-3 shrink-0">
           <Button onClick={onInvite} variant="outline" className="h-9 text-xs font-medium bg-white hover:bg-gray-50 text-gray-700 border-gray-200">
             <Users size={14} className="mr-2" />
             Invite Team
           </Button>
           <Button variant="outline" className="h-9 text-xs font-medium bg-white hover:bg-gray-50 text-gray-700 border-gray-200">
             <Play size={14} className="mr-2" />
             Run Test
           </Button>
           <Button 
             onClick={onEditBlueprint}
             className="h-9 text-xs font-bold bg-[#0A0A0A] hover:bg-gray-900 text-white shadow-lg shadow-gray-900/10 transition-all hover:-translate-y-0.5"
           >
             <Edit3 size={14} className="mr-2" />
             Edit Blueprint
           </Button>
        </div>
      </div>

      {/* 2. KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard 
          icon={Clock} 
          label="Hours Saved" 
          value="124h" 
          trend="+12%" 
          trendPositive={true}
          subtext="vs last month"
        />
        <KpiCard 
          icon={DollarSign} 
          label="Est. Cost Savings" 
          value="$4,250" 
          trend="+8.5%" 
          trendPositive={true}
          subtext="vs last month"
        />
        <KpiCard 
          icon={Zap} 
          label="Total Executions" 
          value="1,240" 
          trend="+24%" 
          trendPositive={true}
          subtext="last 30 days"
        />
        <KpiCard 
          icon={CheckCircle2} 
          label="Success Rate" 
          value="99.2%" 
          trend="-0.1%" 
          trendPositive={false}
          subtext="last 30 days"
        />
      </div>

      {/* 3. MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN (Timeline) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Timeline Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
             <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-[#0A0A0A]">
                  <History size={16} className="text-gray-400" />
                  Recent Activity
                </div>
                <Button variant="ghost" size="sm" className="h-auto p-0 text-xs text-gray-400 hover:text-[#E43632]">View All</Button>
             </div>
             <div className="p-6">
               <div className="space-y-8 relative before:absolute before:left-2.5 before:top-2 before:h-full before:w-px before:bg-gray-100">
                 <TimelineItem 
                   icon={Edit3}
                   iconColor="text-blue-500"
                   iconBg="bg-blue-50"
                   title="Logic Updated"
                   user="Mo"
                   time="2 hours ago"
                   desc="Changed approval threshold from $5k to $10k."
                 />
                 <TimelineItem 
                   icon={AlertTriangle}
                   iconColor="text-amber-500"
                   iconBg="bg-amber-50"
                   title="Execution Warning"
                   user="System"
                   time="5 hours ago"
                   desc="PDF extraction confidence was low (45%) for Invoice #9921."
                 />
                 <TimelineItem 
                   icon={Play}
                   iconColor="text-emerald-500"
                   iconBg="bg-emerald-50"
                   title="Manual Run"
                   user="Sarah (Finance)"
                   time="1 day ago"
                   desc="Triggered manual reconciliation for Q3 expenses."
                 />
               </div>
             </div>
          </div>

        </div>

        {/* RIGHT COLUMN (Suggestions & Risks) */}
        <div className="space-y-6">
           
           {/* Risks / Missing Info */}
           <div className="bg-amber-50/50 rounded-xl border border-amber-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-2 border-b border-amber-100/50">
                 <AlertTriangle size={16} className="text-amber-600" />
                 <span className="text-sm font-bold text-amber-900">Needs Attention</span>
              </div>
              <div className="p-5 space-y-3">
                 <div className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 mt-1.5 rounded-full bg-amber-400 shrink-0" />
                    <p className="text-xs text-amber-800 leading-relaxed">
                      <span className="font-bold">Missing Credentials:</span> The Salesforce connector needs re-authentication.
                    </p>
                 </div>
                 <Button size="sm" className="w-full bg-white border border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300 shadow-sm h-8 text-xs font-bold">
                    Fix Credentials
                 </Button>
              </div>
           </div>

           {/* AI Copilot Suggestions */}
           <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-[#E43632]" />
                    <span className="text-sm font-bold text-[#0A0A0A]">Copilot Suggestions</span>
                 </div>
                 <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-[10px]">2 New</Badge>
              </div>
              <div className="divide-y divide-gray-50">
                 <SuggestionItem 
                   title="Add Error Handling"
                   desc="Add a fallback branch if Xero is down."
                 />
                 <SuggestionItem 
                   title="Optimize Trigger"
                   desc="Filter emails by 'Subject contains Invoice' to reduce noise."
                 />
              </div>
              <div className="p-3 bg-gray-50 border-t border-gray-100">
                 <Button variant="ghost" className="w-full text-xs text-gray-500 hover:text-[#E43632] h-auto py-1">
                   Ask Copilot for more...
                 </Button>
              </div>
           </div>

        </div>
      </div>

    </div>
  );
};

// SUB-COMPONENTS

const KpiCard = ({ icon: Icon, label, value, trend, trendPositive, subtext }: any) => (
  <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.04)] transition-all group">
     <div className="flex items-start justify-between mb-4">
        <div className="p-2 bg-gray-50 rounded-lg group-hover:bg-red-50 group-hover:text-[#E43632] transition-colors text-gray-400">
           <Icon size={18} />
        </div>
        <div className={cn(
          "flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
          trendPositive ? "text-emerald-700 bg-emerald-50" : "text-amber-700 bg-amber-50"
        )}>
           {trendPositive ? <ArrowUpRight size={10} /> : <ArrowRight size={10} className="rotate-45" />}
           {trend}
        </div>
     </div>
     <div>
       <h3 className="text-2xl font-bold text-[#0A0A0A] mb-1 tracking-tight">{value}</h3>
       <p className="text-xs text-gray-500 font-medium">{label}</p>
       <p className="text-[10px] text-gray-400 mt-0.5">{subtext}</p>
     </div>
  </div>
);

const TimelineItem = ({ icon: Icon, iconColor, iconBg, title, user, time, desc }: any) => (
  <div className="relative pl-8">
    <div className={cn(
      "absolute left-0 top-0 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white ring-1 ring-gray-100 shadow-sm z-10",
      iconBg, iconColor
    )}>
       <Icon size={10} />
    </div>
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
       <p className="text-sm font-bold text-gray-900">{title}</p>
       <span className="text-[10px] text-gray-400">{time}</span>
    </div>
    <p className="text-xs text-gray-600 leading-relaxed">{desc}</p>
    <div className="flex items-center gap-1.5 mt-2">
       <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500">
          {user.charAt(0)}
       </div>
       <span className="text-[10px] text-gray-500 font-medium">{user}</span>
    </div>
  </div>
);

const SuggestionItem = ({ title, desc }: any) => (
  <div className="p-4 hover:bg-gray-50 transition-colors cursor-pointer group">
    <div className="flex items-start justify-between mb-1">
      <h4 className="text-xs font-bold text-gray-700 group-hover:text-[#0A0A0A]">{title}</h4>
      <ArrowRight size={12} className="text-gray-300 group-hover:text-[#E43632] transition-colors opacity-0 group-hover:opacity-100" />
    </div>
    <p className="text-[11px] text-gray-500 leading-relaxed">{desc}</p>
  </div>
);
