import React, { useState } from 'react';
import { 
  Search, 
  Plus, 
  MoreHorizontal, 
  Shield, 
  Mail, 
  Clock, 
  X, 
  CheckCircle2, 
  FileText, 
  Activity,
  User,
  ChevronRight,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Textarea } from './ui/textarea';
import { cn } from '../lib/utils';

// --- Types & Mock Data ---

type Role = 'Owner' | 'Admin' | 'Editor' | 'Viewer';

interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar: string;
  lastActive: string;
  automationsCount: number;
  tasksCount: number;
}

const MEMBERS: Member[] = [
  { 
    id: '1', 
    name: 'Sarah Chen', 
    email: 'sarah@company.com', 
    role: 'Owner', 
    avatar: 'https://github.com/shadcn.png', 
    lastActive: 'Just now', 
    automationsCount: 12,
    tasksCount: 3
  },
  { 
    id: '2', 
    name: 'Mike Ross', 
    email: 'mike@company.com', 
    role: 'Editor', 
    avatar: '', 
    lastActive: '2 hours ago', 
    automationsCount: 5,
    tasksCount: 1
  },
  { 
    id: '3', 
    name: 'Jessica Pearson', 
    email: 'jessica@company.com', 
    role: 'Viewer', 
    avatar: '', 
    lastActive: 'Yesterday', 
    automationsCount: 0,
    tasksCount: 0
  },
  { 
    id: '4', 
    name: 'Louis Litt', 
    email: 'louis@company.com', 
    role: 'Admin', 
    avatar: '', 
    lastActive: '5 mins ago', 
    automationsCount: 8,
    tasksCount: 4
  },
];

const RECENT_ACTIVITY = [
  { id: 1, action: 'Approved v1.1 Quote', target: 'Invoice Processing', time: '2 hours ago' },
  { id: 2, action: 'Created new draft', target: 'Expense Reporting', time: 'Yesterday' },
  { id: 3, action: 'Invited new member', target: 'Rachel Zane', time: '2 days ago' },
];

// --- Component ---

export const TeamsView: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const filteredMembers = MEMBERS.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    m.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedMember = MEMBERS.find(m => m.id === selectedMemberId);

  return (
    <div className="flex h-full bg-gray-50 relative overflow-hidden">
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-6 pb-4 shrink-0">
           <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-[#0A0A0A]">Team Members</h1>
                <p className="text-sm text-gray-500">Manage access and roles for your workspace.</p>
              </div>
              <Button 
                onClick={() => setShowInviteModal(true)}
                className="bg-[#E43632] hover:bg-[#C12E2A] text-white font-bold shadow-lg shadow-red-500/20"
              >
                <Plus size={18} className="mr-2" /> Invite Member
              </Button>
           </div>

           <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <Input 
                placeholder="Search by name or email..." 
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
           </div>
        </div>

        {/* Members Table */}
        <div className="flex-1 overflow-y-auto p-6">
           <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden max-w-6xl mx-auto">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50/50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                 <div className="col-span-4">User</div>
                 <div className="col-span-3">Role</div>
                 <div className="col-span-2">Last Active</div>
                 <div className="col-span-2 text-right">Automations</div>
                 <div className="col-span-1"></div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-gray-100">
                 {filteredMembers.map((member) => (
                   <div 
                     key={member.id}
                     onClick={() => setSelectedMemberId(member.id)}
                     className={cn(
                       "grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-gray-50 transition-colors cursor-pointer group",
                       selectedMemberId === member.id ? "bg-red-50/30" : ""
                     )}
                   >
                      <div className="col-span-4 flex items-center gap-3">
                         <Avatar className="h-10 w-10 border border-gray-200">
                            <AvatarImage src={member.avatar} />
                            <AvatarFallback className="bg-gray-100 text-gray-600 font-bold">
                              {member.name.charAt(0)}
                            </AvatarFallback>
                         </Avatar>
                         <div>
                            <p className="text-sm font-bold text-[#0A0A0A]">{member.name}</p>
                            <p className="text-xs text-gray-500">{member.email}</p>
                         </div>
                      </div>
                      
                      <div className="col-span-3" onClick={(e) => e.stopPropagation()}>
                         <Select defaultValue={member.role}>
                            <SelectTrigger className="w-[130px] h-8 text-xs bg-transparent border-gray-200">
                               <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                               <SelectItem value="Owner">Owner</SelectItem>
                               <SelectItem value="Admin">Admin</SelectItem>
                               <SelectItem value="Editor">Editor</SelectItem>
                               <SelectItem value="Viewer">Viewer</SelectItem>
                            </SelectContent>
                         </Select>
                      </div>

                      <div className="col-span-2 text-sm text-gray-500 flex items-center gap-2">
                         <div className={cn(
                           "w-2 h-2 rounded-full",
                           member.lastActive === 'Just now' ? "bg-emerald-500" : "bg-gray-300"
                         )} />
                         {member.lastActive}
                      </div>

                      <div className="col-span-2 text-right text-sm font-mono text-gray-600 px-4">
                         {member.automationsCount}
                      </div>

                      <div className="col-span-1 flex justify-end">
                         <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal size={16} className="text-gray-400" />
                         </Button>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </div>

      {/* Slide-out Detail Panel */}
      <AnimatePresence>
        {selectedMember && (
          <motion.div 
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute top-0 right-0 h-full w-[400px] bg-white border-l border-gray-200 shadow-2xl z-30 flex flex-col"
          >
             <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-400 uppercase tracking-wider">Member Details</span>
                <Button variant="ghost" size="icon" onClick={() => setSelectedMemberId(null)}>
                   <X size={20} className="text-gray-400 hover:text-gray-900" />
                </Button>
             </div>

             <ScrollArea className="flex-1">
                <div className="p-8 space-y-8">
                   {/* Profile Header */}
                   <div className="flex flex-col items-center text-center">
                      <Avatar className="h-24 w-24 border-4 border-gray-50 mb-4">
                         <AvatarImage src={selectedMember.avatar} />
                         <AvatarFallback className="bg-gray-100 text-gray-500 text-2xl font-bold">
                            {selectedMember.name.charAt(0)}
                         </AvatarFallback>
                      </Avatar>
                      <h2 className="text-2xl font-bold text-[#0A0A0A]">{selectedMember.name}</h2>
                      <p className="text-gray-500 mb-2">{selectedMember.email}</p>
                      <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                         {selectedMember.role}
                      </Badge>
                   </div>

                   {/* Stats Grid */}
                   <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                         <p className="text-2xl font-bold text-[#0A0A0A]">{selectedMember.automationsCount}</p>
                         <p className="text-xs text-gray-500">Automations</p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                         <p className="text-2xl font-bold text-[#E43632]">{selectedMember.tasksCount}</p>
                         <p className="text-xs text-gray-500">Pending Tasks</p>
                      </div>
                   </div>

                   {/* Automations Access */}
                   <div>
                      <h3 className="text-sm font-bold text-[#0A0A0A] mb-3 flex items-center gap-2">
                         <Shield size={16} className="text-gray-400" /> Access Summary
                      </h3>
                      <div className="space-y-2">
                         {['Invoice Processing', 'Employee Onboarding', 'Sales Lead Routing'].map((item, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                               <span className="text-sm font-medium text-gray-700">{item}</span>
                               <Badge variant="outline" className="text-[10px] text-gray-400">Editor</Badge>
                            </div>
                         ))}
                         <Button variant="ghost" size="sm" className="w-full text-xs text-gray-500 h-8">View All Access</Button>
                      </div>
                   </div>

                   {/* Recent Activity */}
                   <div>
                      <h3 className="text-sm font-bold text-[#0A0A0A] mb-3 flex items-center gap-2">
                         <Activity size={16} className="text-gray-400" /> Recent Activity
                      </h3>
                      <div className="relative pl-4 border-l border-gray-200 space-y-6">
                         {RECENT_ACTIVITY.map((act) => (
                            <div key={act.id} className="relative">
                               <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-gray-300 border-2 border-white" />
                               <p className="text-sm font-medium text-[#0A0A0A]">{act.action}</p>
                               <p className="text-xs text-gray-500 mb-0.5">{act.target}</p>
                               <p className="text-[10px] text-gray-400">{act.time}</p>
                            </div>
                         ))}
                      </div>
                   </div>
                   
                   {/* Danger Zone */}
                   <div className="pt-8 border-t border-gray-100">
                      <Button variant="outline" className="w-full text-red-600 border-red-100 hover:bg-red-50 hover:text-red-700">
                         <Trash2 size={16} className="mr-2" /> Remove from Workspace
                      </Button>
                   </div>
                </div>
             </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invite Modal */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join the workspace. They will receive an email with access instructions.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            <div className="space-y-2">
               <label className="text-sm font-bold text-gray-700">Email Address</label>
               <Input placeholder="colleague@company.com" />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Full Name</label>
                  <Input placeholder="Jane Doe" />
               </div>
               <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Role</label>
                  <Select defaultValue="editor">
                     <SelectTrigger>
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                     </SelectContent>
                  </Select>
               </div>
            </div>

            <div className="space-y-2">
               <label className="text-sm font-bold text-gray-700">Grant Access (Optional)</label>
               <div className="p-3 border border-gray-200 rounded-lg space-y-2 max-h-[120px] overflow-y-auto bg-gray-50">
                  {['Invoice Processing', 'Employee Onboarding', 'Sales Lead Routing', 'Legal Doc Review'].map((auto, i) => (
                     <div key={i} className="flex items-center gap-2">
                        <input type="checkbox" id={`auto-${i}`} className="rounded border-gray-300 text-[#E43632] focus:ring-[#E43632]" />
                        <label htmlFor={`auto-${i}`} className="text-sm text-gray-700 cursor-pointer">{auto}</label>
                     </div>
                  ))}
               </div>
            </div>

            <div className="space-y-2">
               <label className="text-sm font-bold text-gray-700">Message (Optional)</label>
               <Textarea placeholder="Hey, join me in WRK Studio to collaborate on..." className="resize-none" />
            </div>
          </div>

          <DialogFooter>
             <Button variant="outline" onClick={() => setShowInviteModal(false)}>Cancel</Button>
             <Button className="bg-[#E43632] hover:bg-[#C12E2A] text-white">Send Invitation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};
