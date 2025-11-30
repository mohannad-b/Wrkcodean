import React, { useState } from 'react';
import { Mail, Check, Copy, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

interface InviteTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const MEMBERS = [
  { name: 'Sarah Chen', email: 'sarah@acme.com', role: 'Admin', avatar: 'https://github.com/shadcn.png' },
  { name: 'Mike Ross', email: 'mike@acme.com', role: 'Editor', avatar: '' },
];

export const InviteTeamModal: React.FC<InviteTeamModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText("https://wrk.com/invite/xc9-2k3-99s");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold text-[#0A0A0A]">
             <Users className="text-gray-400" size={20} />
             Invite your team
          </DialogTitle>
          <DialogDescription>
            Collaborate on automations in real-time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
           {/* Invite Input */}
           <div className="flex gap-2">
              <Input 
                placeholder="name@company.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1"
              />
              <Button className="bg-[#0A0A0A] text-white hover:bg-gray-800">Send Invite</Button>
           </div>

           {/* Copy Link */}
           <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                 <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                    <Users size={14} />
                 </div>
                 <span>Anyone with the link can join</span>
              </div>
              <Button variant="ghost" size="sm" onClick={handleCopyLink} className="text-xs font-bold text-[#E43632] hover:bg-red-50 hover:text-[#E43632]">
                 {copied ? <Check size={14} className="mr-1" /> : <Copy size={14} className="mr-1" />}
                 {copied ? 'Copied' : 'Copy Link'}
              </Button>
           </div>

           {/* Member List */}
           <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Current Members</h4>
              <div className="space-y-3">
                 {MEMBERS.map((m) => (
                    <div key={m.email} className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                             <AvatarImage src={m.avatar} />
                             <AvatarFallback>{m.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                             <p className="text-sm font-bold text-[#0A0A0A]">{m.name}</p>
                             <p className="text-xs text-gray-500">{m.email}</p>
                          </div>
                       </div>
                       <span className="text-xs text-gray-400 font-medium">{m.role}</span>
                    </div>
                 ))}
              </div>
           </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
