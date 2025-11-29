import React, { useState } from 'react';
import { 
  Building2, 
  LayoutGrid, 
  FileText, 
  Users, 
  MessageSquare, 
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  ChevronLeft,
  MoreHorizontal,
  Mail,
  Phone,
  ExternalLink,
  Plus,
  Search,
  Calendar,
  BarChart3,
  DollarSign,
  Send,
  Paperclip,
  Tag
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Progress } from './ui/progress';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { cn } from '../lib/utils';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';

// Reuse existing components where possible (conceptually)
// We will build filtered views using the same data structures as OpsProjects and OpsQuotes

// --- MOCK DATA ---

const CLIENT_DATA = {
  id: 'c1',
  name: 'Acme Corp',
  industry: 'Retail',
  health: 'Good',
  activeSpend: 12500,
  committedSpend: 15000,
  activeProjectsCount: 3,
  owner: { name: 'Sarah Connor', role: 'Head of Ops', avatar: 'https://github.com/shadcn.png' },
  projects: [
    { id: 'p1', name: 'Invoice Processing', version: 'v1.0', status: 'Live', spend: 5200, commitment: 6000, owner: 'Sarah C.' },
    { id: 'p2', name: 'Employee Onboarding', version: 'v1.1', status: 'In Build', spend: 0, commitment: 4000, owner: 'Mike R.' },
    { id: 'p3', name: 'Inventory Sync', version: 'v2.0', status: 'Ready', spend: 7300, commitment: 5000, owner: 'Jessica P.' },
  ],
  quotes: [
    { id: 'Q-1024', project: 'Invoice Processing', version: 'v1.1', fee: 1350, price: 0.040, tier: 'Standard', status: 'Draft', date: 'Oct 24, 2025' },
    { id: 'Q-1020', project: 'Inventory Sync', version: 'v2.0', fee: 2500, price: 0.085, tier: 'High Vol', status: 'Signed', date: 'Oct 10, 2025' },
    { id: 'Q-1005', project: 'Invoice Processing', version: 'v1.0', fee: 1000, price: 0.040, tier: 'Standard', status: 'Signed', date: 'Sep 15, 2025' },
  ],
  contacts: [
    { name: 'John Doe', email: 'john@acme.com', role: 'VP of Ops', channel: 'Slack' },
    { name: 'Jane Smith', email: 'jane@acme.com', role: 'Finance Lead', channel: 'Email' },
    { name: 'Robert Tables', email: 'bobby@acme.com', role: 'IT Admin', channel: 'Email' },
  ],
  chat: [
    { id: 1, sender: 'John Doe', role: 'client', text: 'Hey Sarah, quick question about the Invoice Processing update.', time: '2h ago', project: 'Invoice Processing' },
    { id: 2, sender: 'Sarah Connor', role: 'internal', text: 'Hi John! Sure thing, what’s on your mind?', time: '1h ago', project: null },
    { id: 3, sender: 'John Doe', role: 'client', text: 'Are we still on track for the v1.1 release next week?', time: '1h ago', project: 'Invoice Processing' },
    { id: 4, sender: 'Sarah Connor', role: 'internal', text: 'Yes, we are currently in the final QA phase. Looks good for Tuesday.', time: '30m ago', project: 'Invoice Processing' },
  ]
};

// --- SUB-COMPONENTS ---

const MetricCard = ({ label, value, subtext, icon: Icon, color = "text-gray-900" }: any) => (
  <Card className="p-4 flex flex-col gap-2 border-gray-200 shadow-sm">
     <div className="flex justify-between items-start">
        <p className="text-xs font-bold text-gray-500 uppercase">{label}</p>
        {Icon && <Icon size={16} className="text-gray-400" />}
     </div>
     <div>
        <p className={cn("text-2xl font-bold font-mono", color)}>{value}</p>
        {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
     </div>
  </Card>
);

const OverviewTab = () => {
  const utilization = (CLIENT_DATA.activeSpend / CLIENT_DATA.committedSpend) * 100;
  
  return (
    <div className="p-6 space-y-8 h-full overflow-y-auto">
       
       {/* Metrics Grid */}
       <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <MetricCard 
             label="Active Spend" 
             value={`$${CLIENT_DATA.activeSpend.toLocaleString()}`} 
             subtext="Monthly recurring"
             icon={DollarSign}
          />
          <MetricCard 
             label="Committed" 
             value={`$${CLIENT_DATA.committedSpend.toLocaleString()}`} 
             subtext="Contracted minimums"
             icon={FileText}
          />
          <MetricCard 
             label="Utilization" 
             value={`${utilization.toFixed(0)}%`} 
             color={utilization > 100 ? "text-red-600" : "text-emerald-600"}
             subtext="Active / Committed"
             icon={BarChart3}
          />
          <MetricCard 
             label="Active Projects" 
             value={CLIENT_DATA.activeProjectsCount}
             subtext="3 Live, 1 In Build"
             icon={LayoutGrid}
          />
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Projects Table (2/3) */}
          <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
             <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-bold text-[#0A0A0A]">Spend by Project</h3>
                <Button variant="ghost" size="sm" className="text-xs text-gray-500">View All</Button>
             </div>
             <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-xs uppercase font-bold text-gray-500 border-b border-gray-100">
                   <tr>
                      <th className="px-4 py-3">Project</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Spend / Commit</th>
                      <th className="px-4 py-3 text-right">Util %</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                   {CLIENT_DATA.projects.map(p => {
                      const projUtil = p.commitment > 0 ? (p.spend / p.commitment) * 100 : 0;
                      return (
                         <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                               <div className="font-bold text-[#0A0A0A]">{p.name}</div>
                               <div className="text-[10px] text-gray-400">{p.version} • Owner: {p.owner}</div>
                            </td>
                            <td className="px-4 py-3">
                               <Badge variant="outline" className={cn(
                                  "font-medium border px-2 py-0.5 rounded-full text-[10px]",
                                  p.status === 'Live' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                  p.status === 'In Build' ? "bg-blue-50 text-blue-700 border-blue-200" :
                                  "bg-gray-100 text-gray-600 border-gray-200"
                               )}>
                                  {p.status}
                               </Badge>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-600">
                               ${p.spend.toLocaleString()} / <span className="text-gray-400">${p.commitment.toLocaleString()}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                               <span className={cn("font-bold text-xs", projUtil > 100 ? "text-red-500" : "text-emerald-600")}>
                                  {projUtil.toFixed(0)}%
                               </span>
                            </td>
                         </tr>
                      );
                   })}
                </tbody>
             </table>
          </div>

          {/* Health & Owner Card (1/3) */}
          <Card className="p-6 flex flex-col gap-6">
             <div>
                <h3 className="font-bold text-[#0A0A0A] mb-4">Account Health</h3>
                <div className="flex items-center gap-2 mb-2">
                   <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none px-3 py-1 text-sm gap-2">
                      <CheckCircle2 size={14} /> Good
                   </Badge>
                </div>
                <p className="text-xs text-gray-500">
                   Last check-in: 2 days ago. Client is happy with the latest Invoice Processing update.
                </p>
             </div>
             
             <Separator />

             <div>
                <h3 className="font-bold text-[#0A0A0A] mb-4">Account Owner</h3>
                <div className="flex items-center gap-3">
                   <Avatar className="w-10 h-10 border border-gray-200">
                      <AvatarImage src={CLIENT_DATA.owner.avatar} />
                      <AvatarFallback>SC</AvatarFallback>
                   </Avatar>
                   <div>
                      <p className="text-sm font-bold text-[#0A0A0A]">{CLIENT_DATA.owner.name}</p>
                      <p className="text-xs text-gray-500">{CLIENT_DATA.owner.role}</p>
                   </div>
                </div>
                <div className="flex gap-2 mt-4">
                   <Button variant="outline" size="sm" className="flex-1 text-xs"><Mail size={14} className="mr-2"/> Email</Button>
                   <Button variant="outline" size="sm" className="flex-1 text-xs"><MessageSquare size={14} className="mr-2"/> Chat</Button>
                </div>
             </div>
          </Card>

       </div>
    </div>
  );
};

const ProjectsTab = () => (
   <div className="p-6 h-full overflow-y-auto">
      <Card className="overflow-hidden border-gray-200 shadow-sm">
         <table className="w-full text-sm text-left">
             <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-bold text-gray-500">
                <tr>
                   <th className="px-6 py-4">Project</th>
                   <th className="px-6 py-4">Version</th>
                   <th className="px-6 py-4">Status</th>
                   <th className="px-6 py-4">Owner</th>
                   <th className="px-6 py-4 text-right">Action</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-gray-100">
                {CLIENT_DATA.projects.map(p => (
                   <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4 font-bold text-[#0A0A0A]">{p.name}</td>
                      <td className="px-6 py-4">
                         <Badge variant="outline" className="bg-gray-50 border-gray-200 font-mono text-xs text-gray-600">
                            {p.version}
                         </Badge>
                      </td>
                      <td className="px-6 py-4">
                         <Badge className={cn(
                            "border font-medium px-2.5 py-0.5 rounded-full shadow-none",
                            p.status === 'Live' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            p.status === 'In Build' ? "bg-blue-50 text-blue-700 border-blue-200" :
                            "bg-gray-100 text-gray-600 border-gray-200"
                         )}>
                            {p.status}
                         </Badge>
                      </td>
                      <td className="px-6 py-4 text-gray-600 text-xs">{p.owner}</td>
                      <td className="px-6 py-4 text-right">
                         <Button variant="ghost" size="sm" className="text-xs text-gray-500 hover:text-[#0A0A0A]">
                            Open Project <ExternalLink size={12} className="ml-1" />
                         </Button>
                      </td>
                   </tr>
                ))}
             </tbody>
         </table>
      </Card>
   </div>
);

const QuotesTab = () => (
   <div className="p-6 h-full overflow-y-auto">
      <Card className="overflow-hidden border-gray-200 shadow-sm">
         <table className="w-full text-sm text-left">
             <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase font-bold text-gray-500">
                <tr>
                   <th className="px-6 py-4 w-[100px]">ID</th>
                   <th className="px-6 py-4">Automation</th>
                   <th className="px-6 py-4">Version</th>
                   <th className="px-6 py-4">Fees</th>
                   <th className="px-6 py-4">Status</th>
                   <th className="px-6 py-4">Date</th>
                   <th className="px-6 py-4 text-right">Action</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-gray-100">
                {CLIENT_DATA.quotes.map(q => (
                   <tr key={q.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4 font-mono text-xs font-bold text-gray-600">{q.id}</td>
                      <td className="px-6 py-4 font-medium text-[#0A0A0A]">{q.project}</td>
                      <td className="px-6 py-4 text-xs text-gray-500">{q.version}</td>
                      <td className="px-6 py-4">
                         <div className="flex flex-col">
                            <span className="text-xs font-bold">${q.fee.toLocaleString()}</span>
                            <span className="text-[10px] text-gray-400 font-mono">${q.price.toFixed(3)} / run</span>
                         </div>
                      </td>
                      <td className="px-6 py-4">
                         <Badge variant="outline" className={cn(
                            "font-medium px-2 py-0.5 rounded-full shadow-none border",
                            q.status === 'Signed' ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            q.status === 'Draft' ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-gray-100 text-gray-600 border-gray-200"
                         )}>
                            {q.status}
                         </Badge>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500">{q.date}</td>
                      <td className="px-6 py-4 text-right">
                         <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400"><MoreHorizontal size={16}/></Button>
                      </td>
                   </tr>
                ))}
             </tbody>
         </table>
      </Card>
   </div>
);

const ContactsTab = () => (
   <div className="p-6 h-full overflow-y-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {CLIENT_DATA.contacts.map((c, i) => (
            <Card key={i} className="p-4 flex items-start gap-4 border-gray-200 shadow-sm">
               <Avatar className="w-10 h-10 border border-gray-100">
                  <AvatarFallback className="bg-gray-100 text-gray-600 font-bold">{c.name.charAt(0)}</AvatarFallback>
               </Avatar>
               <div className="flex-1">
                  <h4 className="font-bold text-[#0A0A0A]">{c.name}</h4>
                  <p className="text-xs text-gray-500 mb-2">{c.role}</p>
                  <div className="flex flex-col gap-1 text-xs text-gray-600">
                     <div className="flex items-center gap-2">
                        <Mail size={12} className="text-gray-400" /> {c.email}
                     </div>
                     <div className="flex items-center gap-2">
                        <MessageSquare size={12} className="text-gray-400" /> Prefers: {c.channel}
                     </div>
                  </div>
               </div>
            </Card>
         ))}
         <button className="border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors h-full min-h-[140px]">
            <Plus size={24} />
            <span className="text-xs font-bold">Add Contact</span>
         </button>
      </div>
   </div>
);

const ChatTab = () => (
   <div className="flex flex-col h-full bg-white">
      <ScrollArea className="flex-1 p-6 bg-gray-50/50">
         <div className="space-y-6 max-w-3xl mx-auto">
            {CLIENT_DATA.chat.map((msg) => (
               <div key={msg.id} className={cn("flex gap-3", msg.role === 'internal' ? "flex-row-reverse" : "flex-row")}>
                  <Avatar className="w-8 h-8 border border-gray-200 shrink-0">
                     <AvatarImage src={msg.role === 'internal' ? CLIENT_DATA.owner.avatar : undefined} />
                     <AvatarFallback className={msg.role === 'internal' ? "bg-[#0A0A0A] text-white" : "bg-gray-200"}>
                        {msg.sender.charAt(0)}
                     </AvatarFallback>
                  </Avatar>
                  
                  <div className={cn("flex flex-col gap-1 max-w-[80%]", msg.role === 'internal' ? "items-end" : "items-start")}>
                     <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-600">{msg.sender}</span>
                        <span className="text-[10px] text-gray-400">{msg.time}</span>
                     </div>
                     <div className={cn(
                        "p-3 rounded-lg text-sm shadow-sm border",
                        msg.role === 'internal' ? "bg-white border-gray-200 text-gray-800 rounded-tr-none" : "bg-[#0A0A0A] border-[#0A0A0A] text-white rounded-tl-none"
                     )}>
                        {msg.text}
                     </div>
                     {msg.project && (
                        <Badge variant="outline" className="bg-gray-100 text-gray-500 border-gray-200 text-[10px] w-fit gap-1">
                           <Tag size={10} /> {msg.project}
                        </Badge>
                     )}
                  </div>
               </div>
            ))}
         </div>
      </ScrollArea>

      <div className="p-4 border-t border-gray-200 bg-white">
         <div className="max-w-3xl mx-auto space-y-2">
            <div className="flex gap-2">
               <Button variant="outline" size="sm" className="text-xs h-7 px-2 gap-1 text-gray-500 border-gray-200">
                  <Tag size={12} /> Attach Project
               </Button>
               <Button variant="outline" size="sm" className="text-xs h-7 px-2 gap-1 text-gray-500 border-gray-200">
                  <Paperclip size={12} /> Attach File
               </Button>
            </div>
            <div className="flex gap-2">
               <Input className="flex-1 bg-gray-50 border-gray-200" placeholder="Type a message to the client..." />
               <Button className="bg-[#0A0A0A] text-white"><Send size={16} /></Button>
            </div>
         </div>
      </div>
   </div>
);

// --- MAIN COMPONENT ---

interface OpsClientDetailProps {
  onBack: () => void;
}

export const OpsClientDetail: React.FC<OpsClientDetailProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="flex flex-col h-full bg-gray-50 text-[#1A1A1A] font-sans">
      
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 px-8 py-6 shrink-0 z-10">
         <div className="flex flex-col gap-6">
            
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
               <button onClick={onBack} className="hover:text-[#0A0A0A] flex items-center gap-1 transition-colors">
                  <ChevronLeft size={12} /> Clients
               </button>
               <span>/</span>
               <span className="font-bold text-[#0A0A0A]">{CLIENT_DATA.name}</span>
            </div>

            <div className="flex justify-between items-start">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200 text-gray-500 font-bold text-xl">
                     {CLIENT_DATA.name.charAt(0)}
                  </div>
                  <div>
                     <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-[#0A0A0A]">{CLIENT_DATA.name}</h1>
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-none gap-1.5">
                           <CheckCircle2 size={12} /> Good
                        </Badge>
                     </div>
                     <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                        <Building2 size={12} /> {CLIENT_DATA.industry} • Managed by <span className="font-bold text-gray-700">{CLIENT_DATA.owner.name}</span>
                     </p>
                  </div>
               </div>

               <div className="flex gap-3">
                  <Button variant="outline" className="border-gray-200">Edit Client</Button>
                  <Button className="bg-[#0A0A0A] text-white">New Project</Button>
               </div>
            </div>

            {/* Key Metrics Row */}
            <div className="flex gap-8 pt-2">
               <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Active Monthly Spend</p>
                  <p className="text-lg font-mono font-bold text-[#0A0A0A]">${CLIENT_DATA.activeSpend.toLocaleString()}</p>
               </div>
               <div className="w-px h-10 bg-gray-100" />
               <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Committed Spend</p>
                  <p className="text-lg font-mono font-bold text-gray-500">${CLIENT_DATA.committedSpend.toLocaleString()}</p>
               </div>
               <div className="w-px h-10 bg-gray-100" />
               <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">Utilization</p>
                  <p className="text-lg font-mono font-bold text-emerald-600">
                     {((CLIENT_DATA.activeSpend / CLIENT_DATA.committedSpend) * 100).toFixed(0)}%
                  </p>
               </div>
            </div>
         </div>
      </header>

      {/* TABS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
         <div className="px-8 border-b border-gray-200 bg-white shrink-0">
            <TabsList className="h-12 bg-transparent p-0 gap-8">
               {['Overview', 'Projects', 'Billing & Quotes', 'Contacts', 'Chat'].map(tab => {
                  const value = tab.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-');
                  return (
                     <TabsTrigger 
                        key={value} 
                        value={value}
                        className={cn(
                           "h-full rounded-none border-b-2 bg-transparent px-0 text-sm font-medium text-gray-500 shadow-none transition-none data-[state=active]:border-[#E43632] data-[state=active]:text-[#E43632] data-[state=active]:shadow-none hover:text-gray-900"
                        )}
                     >
                        {tab}
                     </TabsTrigger>
                  )
               })}
            </TabsList>
         </div>

         <div className="flex-1 bg-gray-50 overflow-hidden">
            <TabsContent value="overview" className="h-full m-0 data-[state=inactive]:hidden"><OverviewTab /></TabsContent>
            <TabsContent value="projects" className="h-full m-0 data-[state=inactive]:hidden"><ProjectsTab /></TabsContent>
            <TabsContent value="billing-quotes" className="h-full m-0 data-[state=inactive]:hidden"><QuotesTab /></TabsContent>
            <TabsContent value="contacts" className="h-full m-0 data-[state=inactive]:hidden"><ContactsTab /></TabsContent>
            <TabsContent value="chat" className="h-full m-0 data-[state=inactive]:hidden"><ChatTab /></TabsContent>
         </div>
      </Tabs>

    </div>
  );
};
