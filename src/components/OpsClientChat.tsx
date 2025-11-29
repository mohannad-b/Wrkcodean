import React, { useState } from 'react';
import { 
  Search, 
  MoreHorizontal, 
  MessageSquare, 
  Paperclip, 
  Image, 
  Send, 
  Tag,
  User,
  Lock,
  Smile
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { ScrollArea } from './ui/scroll-area';
import { Switch } from './ui/switch';
import { Separator } from './ui/separator';
import { cn } from '../lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

// --- TYPES ---

type MessageType = 'client' | 'internal_wrk' | 'internal_note';

interface ChatMessage {
  id: string;
  type: MessageType;
  sender: {
    name: string;
    avatar?: string;
    role: string;
  };
  text: string;
  timestamp: string;
  attachments?: string[];
  tags?: string[];
}

const MOCK_CHAT: ChatMessage[] = [
  {
    id: '1',
    type: 'client',
    sender: { name: 'John Doe', role: 'Client Lead' },
    text: 'Hi team, just wanted to check if the new invoice threshold logic has been implemented yet?',
    timestamp: 'Yesterday 2:30 PM',
  },
  {
    id: '2',
    type: 'internal_note',
    sender: { name: 'Mike Ross', role: 'Solutions Engineer', avatar: 'https://github.com/shadcn.png' },
    text: 'Checking the blueprint now. I think we need to update the "Filter" node to handle >$10k specifically.',
    timestamp: 'Yesterday 2:45 PM',
    tags: ['Blueprint Check']
  },
  {
    id: '3',
    type: 'internal_wrk',
    sender: { name: 'Mike Ross', role: 'Solutions Engineer', avatar: 'https://github.com/shadcn.png' },
    text: 'Hey John! We are finalizing that logic today. It will be ready for review by tomorrow morning.',
    timestamp: 'Yesterday 2:50 PM',
  },
  {
    id: '4',
    type: 'client',
    sender: { name: 'John Doe', role: 'Client Lead' },
    text: 'Great, thanks Mike. Also attaching the updated sanctions list for reference.',
    timestamp: 'Yesterday 3:00 PM',
    attachments: ['Sanctions_2025_v2.pdf']
  }
];

const TEMPLATES = [];

export const OpsClientChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_CHAT);
  const [inputText, setInputText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [filterInternalOnly, setFilterInternalOnly] = useState(false);

  const filteredMessages = messages.filter(m => {
    if (filterInternalOnly) return m.type === 'internal_note';
    return true; 
  });

  const handleSend = () => {
    if (!inputText.trim()) return;
    
    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      type: isInternalNote ? 'internal_note' : 'internal_wrk',
      sender: { name: 'Sarah Connor', role: 'Head of Ops', avatar: 'https://github.com/shadcn.png' },
      text: inputText,
      timestamp: 'Just now',
    };

    setMessages([...messages, newMsg]);
    setInputText('');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 border-l border-gray-200 w-full shrink-0">
      
      {/* HEADER */}
      <div className="bg-white p-4 border-b border-gray-200 flex flex-col gap-3">
         <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#0A0A0A] flex items-center gap-2">
               <MessageSquare size={18} /> Client Chat
            </h3>
            <div className="flex items-center gap-2">
               <span className="text-[10px] font-bold text-gray-500 uppercase">Internal Notes Only</span>
               <Switch 
                  checked={filterInternalOnly}
                  onCheckedChange={setFilterInternalOnly}
                  className="scale-75"
               />
            </div>
         </div>
      </div>

      {/* CHAT LIST */}
      <ScrollArea className="flex-1 p-4">
         <div className="space-y-6">
            {filteredMessages.map((msg) => {
               const isMe = msg.type === 'internal_wrk' || msg.type === 'internal_note';
               const isNote = msg.type === 'internal_note';

               return (
                  <div key={msg.id} className={cn("flex gap-3", isMe ? "flex-row-reverse" : "flex-row")}>
                     <Avatar className="w-8 h-8 border border-gray-200 shrink-0">
                        <AvatarImage src={msg.sender.avatar} />
                        <AvatarFallback className={cn("text-[10px]", isMe ? "bg-gray-900 text-white" : "bg-blue-100 text-blue-700")}>
                           {msg.sender.name.charAt(0)}
                        </AvatarFallback>
                     </Avatar>
                     
                     <div className={cn("flex flex-col max-w-[85%]", isMe ? "items-end" : "items-start")}>
                        <div className="flex items-center gap-2 mb-1">
                           <span className="text-xs font-bold text-gray-600">{msg.sender.name}</span>
                           <span className="text-[10px] text-gray-400">{msg.timestamp}</span>
                        </div>
                        
                        <div className={cn(
                           "p-3 text-sm shadow-sm relative group",
                           isNote ? "bg-amber-50 border border-amber-200 text-amber-900 rounded-lg" :
                           isMe ? "bg-white border border-gray-200 text-gray-800 rounded-xl rounded-tr-none" : 
                           "bg-blue-50 border border-blue-100 text-blue-900 rounded-xl rounded-tl-none"
                        )}>
                           {isNote && (
                              <div className="absolute -top-2.5 left-2 bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                                 <Lock size={8} /> Internal Note
                              </div>
                           )}
                           
                           <p className="leading-relaxed">{msg.text}</p>
                           
                           {msg.attachments && (
                              <div className="mt-2 space-y-1">
                                 {msg.attachments.map((file, i) => (
                                    <div key={i} className="flex items-center gap-2 bg-black/5 p-1.5 rounded text-xs font-medium">
                                       <Paperclip size={12} /> {file}
                                    </div>
                                 ))}
                              </div>
                           )}

                           {msg.tags && (
                              <div className="mt-2 flex gap-1">
                                 {msg.tags.map(tag => (
                                    <span key={tag} className="text-[10px] bg-black/5 px-1.5 py-0.5 rounded-full font-medium text-gray-600">
                                       #{tag}
                                    </span>
                                 ))}
                              </div>
                           )}
                        </div>
                     </div>
                  </div>
               );
            })}
         </div>
      </ScrollArea>

      {/* INPUT AREA */}
      <div className="bg-white border-t border-gray-200 p-4 z-10">
         
         <div className={cn("relative rounded-xl border transition-colors", isInternalNote ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200")}>
             {isInternalNote && (
                <div className="absolute -top-2.5 left-3 bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                   <Lock size={8} /> Internal Note Mode
                </div>
             )}
             
             <textarea 
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={isInternalNote ? "Add an internal note..." : "Message the client..."}
                className="w-full bg-transparent border-none text-sm p-3 min-h-[80px] resize-none focus:ring-0 focus:outline-none placeholder:text-gray-400"
             />
             
             <div className="flex justify-between items-center p-2 border-t border-gray-100/50">
                <div className="flex items-center gap-1">
                   <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600"><Paperclip size={16}/></Button>
                   <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600"><Tag size={16}/></Button>
                   
                   <div className="h-4 w-px bg-gray-200 mx-1" />
                   
                   <div className="flex items-center gap-2 ml-1 cursor-pointer" onClick={() => setIsInternalNote(!isInternalNote)}>
                      <Switch checked={isInternalNote} className="scale-75" />
                      <span className={cn("text-[10px] font-bold select-none", isInternalNote ? "text-amber-600" : "text-gray-400")}>
                         Internal Note
                      </span>
                   </div>
                </div>
                
                <Button 
                   size="sm" 
                   onClick={handleSend}
                   className={cn(
                      "h-8 px-4 transition-colors", 
                      isInternalNote ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-[#0A0A0A] hover:bg-gray-800 text-white"
                   )}
                >
                   <Send size={14} />
                </Button>
             </div>
         </div>
      </div>

    </div>
  );
};
