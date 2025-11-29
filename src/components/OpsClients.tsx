import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  Users,
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2,
  Building2,
  ExternalLink,
  Mail,
  Phone
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Progress } from './ui/progress';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { cn } from '../lib/utils';
import { OpsClientDetail } from './OpsClientDetail';

// --- Types & Mock Data ---

type ClientHealth = 'Good' | 'At Risk' | 'Churn Risk';

interface Client {
  id: string;
  name: string;
  industry: string;
  activeSpend: number;
  committedSpend: number;
  activeProjects: number;
  health: ClientHealth;
  owner: { name: string; avatar: string };
  lastActivity: string;
}

const MOCK_CLIENTS: Client[] = [
  {
    id: 'c1',
    name: 'Acme Corp',
    industry: 'Retail',
    activeSpend: 12500,
    committedSpend: 15000,
    activeProjects: 3,
    health: 'Good',
    owner: { name: 'Sarah C.', avatar: 'https://github.com/shadcn.png' },
    lastActivity: '2h ago'
  },
  {
    id: 'c2',
    name: 'Globex Inc',
    industry: 'Logistics',
    activeSpend: 4200,
    committedSpend: 10000,
    activeProjects: 1,
    health: 'At Risk',
    owner: { name: 'Mike R.', avatar: '' },
    lastActivity: '1d ago'
  },
  {
    id: 'c3',
    name: 'Soylent Corp',
    industry: 'Manufacturing',
    activeSpend: 28000,
    committedSpend: 25000,
    activeProjects: 5,
    health: 'Good',
    owner: { name: 'Jessica P.', avatar: '' },
    lastActivity: '15m ago'
  },
  {
    id: 'c4',
    name: 'Massive Dynamic',
    industry: 'R&D',
    activeSpend: 1500,
    committedSpend: 8000,
    activeProjects: 1,
    health: 'Churn Risk',
    owner: { name: 'Walter B.', avatar: '' },
    lastActivity: '5d ago'
  },
  {
    id: 'c5',
    name: 'Stark Ind',
    industry: 'Defense',
    activeSpend: 85000,
    committedSpend: 80000,
    activeProjects: 8,
    health: 'Good',
    owner: { name: 'Tony S.', avatar: '' },
    lastActivity: '1h ago'
  },
  {
    id: 'c6',
    name: 'Cyberdyne',
    industry: 'Technology',
    activeSpend: 5000,
    committedSpend: 5000,
    activeProjects: 2,
    health: 'Good',
    owner: { name: 'Sarah C.', avatar: 'https://github.com/shadcn.png' },
    lastActivity: '3d ago'
  },
  {
    id: 'c7',
    name: 'Umbrella Corp',
    industry: 'Pharma',
    activeSpend: 3200,
    committedSpend: 12000,
    activeProjects: 2,
    health: 'At Risk',
    owner: { name: 'Mike R.', avatar: '' },
    lastActivity: '2d ago'
  }
];

const HEALTH_CONFIG: Record<ClientHealth, { color: string, icon: React.ElementType }> = {
  'Good': { color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  'At Risk': { color: 'bg-amber-50 text-amber-700 border-amber-200', icon: AlertTriangle },
  'Churn Risk': { color: 'bg-red-50 text-red-700 border-red-200', icon: TrendingDown },
};

export const OpsClients: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [healthFilter, setHealthFilter] = useState<string>('all');
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  
  const filteredClients = MOCK_CLIENTS.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesHealth = healthFilter === 'all' || c.health === healthFilter;
    return matchesSearch && matchesHealth;
  });

  const getUtilizationColor = (active: number, committed: number) => {
    const util = (active / committed) * 100;
    if (util >= 100) return 'bg-emerald-500';
    if (util >= 80) return 'bg-emerald-400';
    if (util >= 50) return 'bg-amber-400';
    return 'bg-red-400';
  };

  if (selectedClient) {
     return <OpsClientDetail onBack={() => setSelectedClient(null)} />;
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 text-[#1A1A1A] font-sans">
      
      {/* HEADER */}
      <div className="bg-white border-b border-gray-200 px-8 py-5 shrink-0 z-10">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
             <div>
                 <h1 className="text-2xl font-bold text-[#0A0A0A]">Clients</h1>
                 <p className="text-xs text-gray-500 mt-1">Managing {MOCK_CLIENTS.length} active accounts</p>
             </div>
             <Button className="bg-[#0A0A0A] text-white hover:bg-gray-800 gap-2">
                 <span className="text-lg leading-none mb-0.5">+</span> New Client
             </Button>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
             {/* Filters */}
             <div className="flex items-center gap-3 flex-1 overflow-x-auto pb-1 no-scrollbar">
                <div className="relative w-64 shrink-0">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                   <Input 
                      placeholder="Search clients..." 
                      className="pl-9 bg-gray-50 border-gray-200 focus:bg-white transition-colors"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                   />
                </div>
                
                <div className="h-8 w-px bg-gray-200 mx-2" />

                <Select value={healthFilter} onValueChange={setHealthFilter}>
                   <SelectTrigger className="w-[150px] border-gray-200 bg-white text-xs font-medium">
                      <SelectValue placeholder="Health" />
                   </SelectTrigger>
                   <SelectContent>
                      <SelectItem value="all">All Health</SelectItem>
                      <SelectItem value="Good">Good</SelectItem>
                      <SelectItem value="At Risk">At Risk</SelectItem>
                      <SelectItem value="Churn Risk">Churn Risk</SelectItem>
                   </SelectContent>
                </Select>

                <Select defaultValue="all">
                   <SelectTrigger className="w-[150px] border-gray-200 bg-white text-xs font-medium">
                      <SelectValue placeholder="Owner" />
                   </SelectTrigger>
                   <SelectContent>
                      <SelectItem value="all">All Owners</SelectItem>
                      <SelectItem value="sarah">Sarah C.</SelectItem>
                      <SelectItem value="mike">Mike R.</SelectItem>
                   </SelectContent>
                </Select>
             </div>
             
             <div className="text-xs text-gray-400 font-mono">
                Total Active Spend: ${(MOCK_CLIENTS.reduce((acc, c) => acc + c.activeSpend, 0) / 1000).toFixed(1)}k
             </div>
          </div>
        </div>
      </div>

      {/* TABLE CONTENT */}
      <div className="flex-1 overflow-auto p-8">
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden min-w-[1000px]">
            <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-bold text-gray-500">
                    <tr>
                        <th className="px-6 py-4 font-bold">Client / Workspace</th>
                        <th className="px-6 py-4 font-bold">Active Spend</th>
                        <th className="px-6 py-4 font-bold">Committed</th>
                        <th className="px-6 py-4 font-bold w-[200px]">Utilization</th>
                        <th className="px-6 py-4 font-bold text-center">Projects</th>
                        <th className="px-6 py-4 font-bold">Health</th>
                        <th className="px-6 py-4 font-bold">Owner</th>
                        <th className="px-6 py-4 font-bold">Last Activity</th>
                        <th className="px-6 py-4 font-bold text-right">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                    {filteredClients.map((c) => {
                        const HealthIcon = HEALTH_CONFIG[c.health].icon;
                        const utilization = Math.min((c.activeSpend / c.committedSpend) * 100, 100);
                        
                        return (
                            <tr key={c.id} onClick={() => setSelectedClient(c.id)} className="hover:bg-gray-50/50 transition-colors group cursor-pointer">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-gray-100 border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                                            {c.name.charAt(0)}
                                        </div>
                                        <div>
                                            <div className="font-bold text-[#0A0A0A]">{c.name}</div>
                                            <div className="text-[10px] text-gray-400">{c.industry}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="font-mono text-gray-800 font-medium">
                                       ${c.activeSpend.toLocaleString()}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="font-mono text-gray-500">
                                       ${c.committedSpend.toLocaleString()}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex justify-between text-[10px] font-medium text-gray-500">
                                           <span>{utilization.toFixed(0)}%</span>
                                        </div>
                                        <Progress 
                                           value={utilization} 
                                           className="h-1.5 bg-gray-100" 
                                           indicatorClassName={getUtilizationColor(c.activeSpend, c.committedSpend)} 
                                        />
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <Badge variant="secondary" className="bg-gray-100 text-gray-600 font-mono">
                                       {c.activeProjects}
                                    </Badge>
                                </td>
                                <td className="px-6 py-4">
                                    <Badge variant="outline" className={cn("font-medium gap-1.5 pr-3 pl-2 py-0.5 rounded-full shadow-none border", HEALTH_CONFIG[c.health].color)}>
                                        <HealthIcon size={12} />
                                        {c.health}
                                    </Badge>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <Avatar className="w-6 h-6 border border-gray-200">
                                            <AvatarImage src={c.owner.avatar} />
                                            <AvatarFallback className="text-[9px] bg-gray-100">{c.owner.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <span className="text-xs text-gray-600">{c.owner.name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-xs text-gray-500">{c.lastActivity}</span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600">
                                                <MoreHorizontal size={16} />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48">
                                            <DropdownMenuItem className="gap-2 text-xs cursor-pointer">
                                                <ExternalLink size={14} className="text-gray-500" /> Open Dashboard
                                            </DropdownMenuItem>
                                            <DropdownMenuItem className="gap-2 text-xs cursor-pointer">
                                                <Mail size={14} className="text-gray-500" /> Email Contact
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {filteredClients.length === 0 && (
                <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-2">
                    <Users size={24} className="opacity-20" />
                    <p>No clients found matching your filters.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
