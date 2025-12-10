'use client';

import React, { useState } from 'react';
import { 
  MessageSquare, 
  AlertCircle, 
  PlayCircle, 
  GitCommit, 
  FileEdit,
  Search,
  Filter,
  ArrowRight
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const ActivityTab: React.FC = () => {
  const [filter, setFilter] = useState('all');

  const activities = [
    {
      id: 1,
      type: 'change',
      user: { name: 'Mo', avatar: '' },
      action: 'updated logic',
      target: 'Check Amount',
      time: '2 hours ago',
      desc: 'Changed condition from >$5k to >$10k.',
      icon: FileEdit,
      color: 'text-blue-600 bg-blue-50'
    },
    {
      id: 2,
      type: 'comment',
      user: { name: 'Sarah', avatar: '' },
      action: 'commented on',
      target: 'Request Approval',
      time: '3 hours ago',
      desc: 'We should also notify the VP if the amount is over $50k.',
      icon: MessageSquare,
      color: 'text-gray-600 bg-gray-100'
    },
    {
      id: 3,
      type: 'error',
      user: { name: 'System', avatar: '' },
      action: 'reported error',
      target: 'Create Draft Bill',
      time: '5 hours ago',
      desc: 'Connection timeout to Xero API (500).',
      icon: AlertCircle,
      color: 'text-red-600 bg-red-50'
    },
    {
      id: 4,
      type: 'test',
      user: { name: 'Mo', avatar: '' },
      action: 'ran test',
      target: 'Full Workflow',
      time: '1 day ago',
      desc: 'Test completed successfully (Duration: 1.2s).',
      icon: PlayCircle,
      color: 'text-emerald-600 bg-emerald-50'
    },
    {
      id: 5,
      type: 'update',
      user: { name: 'Mike', avatar: '' },
      action: 'deployed version',
      target: 'v2.2',
      time: '1 week ago',
      desc: 'Promoted to production.',
      icon: GitCommit,
      color: 'text-purple-600 bg-purple-50'
    }
  ];

  const filteredActivities = filter === 'all' 
    ? activities 
    : activities.filter(a => a.type === filter || (filter === 'tests' && a.type === 'test'));

  return (
    <div className="p-8 max-w-4xl mx-auto h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-[#0A0A0A]">Activity Log</h2>
        <div className="flex items-center gap-2">
           <div className="relative">
             <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
             <Input className="pl-9 w-[200px] h-9 text-xs" placeholder="Search activity..." />
           </div>
           <Button variant="outline" size="icon" className="h-9 w-9">
             <Filter size={14} />
           </Button>
        </div>
      </div>

      <div className="mb-6">
        <Tabs value={filter} onValueChange={setFilter} className="w-full">
          <TabsList className="bg-gray-100/50 p-1">
            <TabsTrigger value="all" className="text-xs">All Activity</TabsTrigger>
            <TabsTrigger value="comment" className="text-xs">Comments</TabsTrigger>
            <TabsTrigger value="change" className="text-xs">Changes</TabsTrigger>
            <TabsTrigger value="tests" className="text-xs">Tests & Runs</TabsTrigger>
            <TabsTrigger value="error" className="text-xs">Errors</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-6 relative before:absolute before:left-5 before:top-2 before:h-[calc(100%-20px)] before:w-px before:bg-gray-100">
        {filteredActivities.map((item) => (
          <div key={item.id} className="relative pl-12 group">
            {/* Icon Timeline Marker */}
            <div className={`absolute left-0 top-0 w-10 h-10 rounded-full flex items-center justify-center border-4 border-white shadow-sm z-10 ${item.color}`}>
               <item.icon size={16} />
            </div>

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all">
               <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                     <Avatar className="w-6 h-6">
                        <AvatarFallback className="text-[10px] bg-gray-100">{item.user.name.charAt(0)}</AvatarFallback>
                     </Avatar>
                     <span className="text-sm font-bold text-[#0A0A0A]">{item.user.name}</span>
                     <span className="text-sm text-gray-500">{item.action}</span>
                     <Badge variant="secondary" className="bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200 font-mono text-[10px]">
                       {item.target}
                     </Badge>
                  </div>
                  <span className="text-xs text-gray-400 font-medium">{item.time}</span>
               </div>
               
               <p className="text-sm text-gray-600 leading-relaxed mb-3">
                 {item.desc}
               </p>

               <div className="flex items-center gap-4">
                 <button className="text-xs text-gray-400 hover:text-[#E43632] font-medium flex items-center gap-1 transition-colors">
                   View on Blueprint <ArrowRight size={10} />
                 </button>
                 {item.type === 'comment' && (
                   <button className="text-xs text-gray-400 hover:text-gray-600 font-medium">
                     Reply
                   </button>
                 )}
               </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
