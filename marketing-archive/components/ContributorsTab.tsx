import React, { useState } from 'react';
import { 
  User, 
  Mail, 
  Shield, 
  MoreVertical, 
  Plus, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Phone,
  MapPin,
  Calendar
} from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { currentUser } from '../data';

interface Contributor {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Editor' | 'Viewer';
  status: 'Active' | 'Pending' | 'Away';
  avatar?: string;
  tasks: number;
  lastActive: string;
  contributions: string[];
}

export const ContributorsTab: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string | null>('1');

  const contributors: Contributor[] = [
    {
      id: '1',
      name: currentUser.name,
      email: 'mo@wrk.com',
      role: 'Owner',
      status: 'Active',
      avatar: currentUser.avatar,
      tasks: 0,
      lastActive: 'Now',
      contributions: ['Finance Reconciliation', 'Invoice Trigger', 'Slack Notification']
    },
    {
      id: '2',
      name: 'Sarah Chen',
      email: 'sarah.chen@wrk.com',
      role: 'Editor',
      status: 'Active',
      avatar: '',
      tasks: 2,
      lastActive: '2 hours ago',
      contributions: ['Request Approval', 'Compliance Check']
    },
    {
      id: '3',
      name: 'Mike Ross',
      email: 'mike.ross@wrk.com',
      role: 'Viewer',
      status: 'Away',
      avatar: '',
      tasks: 0,
      lastActive: '1 week ago',
      contributions: []
    },
    {
      id: '4',
      name: 'Alex Smith',
      email: 'alex@external.com',
      role: 'Editor',
      status: 'Pending',
      avatar: '',
      tasks: 0,
      lastActive: 'Never',
      contributions: []
    }
  ];

  const selectedUser = contributors.find(c => c.id === selectedId);

  return (
    <div className="flex h-full bg-white">
      {/* Left Panel: List */}
      <div className="w-[350px] border-r border-gray-200 flex flex-col">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
             <h2 className="font-bold text-[#0A0A0A]">Contributors</h2>
             <p className="text-xs text-gray-500">{contributors.length} members</p>
          </div>
          <Button size="sm" className="h-8 w-8 rounded-full p-0 bg-[#E43632] hover:bg-[#C12E2A]">
            <Plus size={16} />
          </Button>
        </div>
        
        <ScrollArea className="flex-1">
           <div className="p-3 space-y-1">
             {contributors.map((user) => (
               <div 
                 key={user.id}
                 onClick={() => setSelectedId(user.id)}
                 className={`p-3 rounded-xl flex items-center gap-3 cursor-pointer transition-all ${
                   selectedId === user.id 
                     ? 'bg-gray-50 border border-gray-200 shadow-sm' 
                     : 'hover:bg-gray-50 border border-transparent'
                 }`}
               >
                 <div className="relative">
                   <Avatar>
                     <AvatarImage src={user.avatar} />
                     <AvatarFallback className="bg-gray-200 text-gray-600 text-xs">{user.name.charAt(0)}</AvatarFallback>
                   </Avatar>
                   <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                     user.status === 'Active' ? 'bg-emerald-500' : 
                     user.status === 'Pending' ? 'bg-amber-500' : 'bg-gray-300'
                   }`} />
                 </div>
                 <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                       <span className={`text-sm font-bold truncate ${selectedId === user.id ? 'text-[#0A0A0A]' : 'text-gray-700'}`}>
                         {user.name}
                       </span>
                       {user.tasks > 0 && (
                         <Badge className="h-4 px-1 text-[9px] bg-red-50 text-[#E43632] border-red-100">{user.tasks} Tasks</Badge>
                       )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{user.role}</p>
                 </div>
                 <MoreVertical size={14} className="text-gray-300" />
               </div>
             ))}
           </div>
        </ScrollArea>
      </div>

      {/* Right Panel: Details */}
      <div className="flex-1 bg-gray-50/50 p-8 overflow-y-auto">
         {selectedUser ? (
           <div className="max-w-2xl mx-auto space-y-6">
             
             {/* Profile Card */}
             <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 flex items-start justify-between">
               <div className="flex items-start gap-5">
                  <Avatar className="w-20 h-20 border-4 border-white shadow-lg">
                     <AvatarImage src={selectedUser.avatar} />
                     <AvatarFallback className="bg-gray-100 text-2xl text-gray-400">{selectedUser.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="pt-1">
                     <h1 className="text-2xl font-bold text-[#0A0A0A]">{selectedUser.name}</h1>
                     <div className="flex items-center gap-2 text-sm text-gray-500 mt-1 mb-3">
                        <Mail size={14} /> {selectedUser.email}
                     </div>
                     <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-gray-50 border-gray-200 text-gray-600">
                          {selectedUser.role}
                        </Badge>
                        <Badge variant="outline" className={`
                          ${selectedUser.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 
                            selectedUser.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-gray-50 text-gray-500 border-gray-100'}
                        `}>
                          {selectedUser.status}
                        </Badge>
                     </div>
                  </div>
               </div>
               <Button variant="outline" size="sm">Edit Role</Button>
             </div>

             <div className="grid grid-cols-2 gap-6">
               {/* Stats */}
               <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                  <h3 className="font-bold text-[#0A0A0A] text-sm uppercase tracking-wider">Activity Stats</h3>
                  <div className="space-y-3">
                     <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-2"><Clock size={14} /> Last Active</span>
                        <span className="font-medium text-[#0A0A0A]">{selectedUser.lastActive}</span>
                     </div>
                     <Separator />
                     <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-2"><CheckCircle size={14} /> Tasks Completed</span>
                        <span className="font-medium text-[#0A0A0A]">12</span>
                     </div>
                     <Separator />
                     <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 flex items-center gap-2"><AlertCircle size={14} /> Outstanding</span>
                        <span className="font-medium text-[#E43632]">{selectedUser.tasks}</span>
                     </div>
                  </div>
               </div>
               
               {/* Contact Info */}
               <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                  <h3 className="font-bold text-[#0A0A0A] text-sm uppercase tracking-wider">Contact Details</h3>
                  <div className="space-y-3">
                     <div className="flex items-center gap-3 text-sm">
                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                           <Phone size={14} />
                        </div>
                        <span className="text-gray-600">+1 (555) 123-4567</span>
                     </div>
                     <div className="flex items-center gap-3 text-sm">
                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                           <MapPin size={14} />
                        </div>
                        <span className="text-gray-600">San Francisco, CA</span>
                     </div>
                     <div className="flex items-center gap-3 text-sm">
                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                           <Calendar size={14} />
                        </div>
                        <span className="text-gray-600">Local Time: 10:42 AM</span>
                     </div>
                  </div>
               </div>
             </div>

             {/* Contributions */}
             <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-bold text-[#0A0A0A] mb-4">Recent Contributions</h3>
                {selectedUser.contributions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedUser.contributions.map((c, i) => (
                      <Badge key={i} variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer px-3 py-1.5">
                        {c}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">No contributions recorded yet.</p>
                )}
             </div>

             {/* Outstanding Tasks */}
             {selectedUser.tasks > 0 && (
               <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
                  <h3 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                    <AlertCircle size={16} /> Outstanding Tasks
                  </h3>
                  <div className="space-y-2">
                     <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-amber-100 shadow-sm">
                        <div className="w-5 h-5 rounded border-2 border-gray-300" />
                        <span className="text-sm text-gray-700 font-medium">Review Salesforce Connection Credentials</span>
                     </div>
                     <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-amber-100 shadow-sm">
                        <div className="w-5 h-5 rounded border-2 border-gray-300" />
                        <span className="text-sm text-gray-700 font-medium">Approve Logic Change for &gt;$10k</span>
                     </div>
                  </div>
               </div>
             )}

           </div>
         ) : (
           <div className="h-full flex items-center justify-center text-gray-400">
             <p>Select a contributor to view details</p>
           </div>
         )}
      </div>
    </div>
  );
};
