import React, { useState } from 'react';
import { 
  Send, 
  Paperclip, 
  Image, 
  MessageSquare,
  Bot,
  User,
  ShieldCheck
} from 'lucide-react';
import { Button } from './ui/button';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '../lib/utils';

// Types
type MessageType = 'client' | 'wrk_team' | 'system';

interface ChatMessage {
  id: string;
  type: MessageType;
  sender?: {
    name: string;
    avatar?: string;
    role?: string;
  };
  text: string;
  timestamp: string;
  attachments?: string[];
}

const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: '1',
    type: 'system',
    text: 'Quote generated for v1.1 Revision',
    timestamp: 'Nov 13, 9:00 AM'
  },
  {
    id: '2',
    type: 'wrk_team',
    sender: { name: 'Mike Ross', role: 'Solutions Engineer', avatar: '' },
    text: 'Hi there! I’ve just updated the quote to include the new compliance logic you requested. Let me know if you have any questions.',
    timestamp: 'Nov 13, 9:15 AM'
  },
  {
    id: '3',
    type: 'client',
    sender: { name: 'You', role: 'Client' },
    text: 'Thanks Mike. Does this include the sanctions list API integration?',
    timestamp: 'Nov 13, 9:45 AM'
  },
  {
    id: '4',
    type: 'wrk_team',
    sender: { name: 'Mike Ross', role: 'Solutions Engineer', avatar: '' },
    text: 'Yes, it does! That is covered under the "Configuration" line item in the delta.',
    timestamp: 'Nov 13, 10:00 AM'
  },
  {
    id: '5',
    type: 'system',
    text: 'Build moved to QA phase',
    timestamp: 'Today, 2:00 PM'
  }
];

export const ClientBuildChat: React.FC<{ className?: string }> = ({ className }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    if (!inputText.trim()) return;

    const newMsg: ChatMessage = {
      id: Date.now().toString(),
      type: 'client',
      sender: { name: 'You', role: 'Client' },
      text: inputText,
      timestamp: 'Just now'
    };

    setMessages([...messages, newMsg]);
    setInputText('');

    // Mock auto-reply
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: 'wrk_team',
        sender: { name: 'Mike Ross', role: 'Solutions Engineer' },
        text: 'Received! We will take a look shortly.',
        timestamp: 'Just now'
      }]);
    }, 1000);
  };

  return (
    <div className={cn("bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden h-[500px]", className)}>
      
      {/* Header */}
      <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-[#E43632]/10 text-[#E43632] rounded-lg">
            <MessageSquare size={16} />
          </div>
          <div>
             <h3 className="font-bold text-[#0A0A0A] text-sm">Messages with WRK</h3>
             <p className="text-[10px] text-gray-500 font-medium">Direct line to your build team</p>
          </div>
        </div>
        <div className="flex -space-x-2">
           <Avatar className="w-6 h-6 border-2 border-white">
              <AvatarFallback className="bg-gray-900 text-white text-[9px]">M</AvatarFallback>
           </Avatar>
           <Avatar className="w-6 h-6 border-2 border-white">
              <AvatarFallback className="bg-gray-200 text-gray-600 text-[9px]"><ShieldCheck size={10}/></AvatarFallback>
           </Avatar>
        </div>
      </div>

      {/* Message List */}
      <ScrollArea className="flex-1 p-4 bg-white">
        <div className="space-y-6">
           {messages.map((msg) => {
             if (msg.type === 'system') {
               return (
                 <div key={msg.id} className="flex items-center justify-center gap-2 my-4">
                    <div className="h-px bg-gray-100 flex-1" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 px-2 py-1 rounded-full border border-gray-100">
                       {msg.text} • {msg.timestamp}
                    </span>
                    <div className="h-px bg-gray-100 flex-1" />
                 </div>
               );
             }

             const isMe = msg.type === 'client';

             return (
               <div key={msg.id} className={cn("flex gap-3", isMe ? "flex-row-reverse" : "flex-row")}>
                 <Avatar className="w-8 h-8 border border-gray-100 shrink-0 mt-1">
                   <AvatarImage src={msg.sender?.avatar} />
                   <AvatarFallback className={cn("text-[10px] font-bold", isMe ? "bg-gray-100 text-gray-600" : "bg-[#E43632] text-white")}>
                      {msg.sender?.name.charAt(0)}
                   </AvatarFallback>
                 </Avatar>
                 
                 <div className={cn("flex flex-col max-w-[80%]", isMe ? "items-end" : "items-start")}>
                    <div className="flex items-center gap-2 mb-1 px-1">
                       <span className="text-[11px] font-bold text-gray-900">{msg.sender?.name}</span>
                       <span className="text-[10px] text-gray-400">{msg.timestamp}</span>
                    </div>
                    
                    <div className={cn(
                       "p-3 text-sm shadow-sm leading-relaxed",
                       isMe ? "bg-gray-100 text-gray-800 rounded-2xl rounded-tr-none" : 
                              "bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-none"
                    )}>
                       {msg.text}
                       {msg.attachments && (
                          <div className="mt-2 pt-2 border-t border-gray-200/50 space-y-1">
                             {msg.attachments.map((file, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs bg-black/5 p-1.5 rounded">
                                   <Paperclip size={12} /> {file}
                                </div>
                             ))}
                          </div>
                       )}
                    </div>
                 </div>
               </div>
             );
           })}
        </div>
        
        {/* Hint Text */}
        <div className="mt-8 text-center">
           <p className="text-[10px] text-gray-400 max-w-[200px] mx-auto">
              Use this chat to clarify requirements, ask questions, or request changes. WRK will reply here.
           </p>
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-3 border-t border-gray-100 bg-white z-10">
         <div className="relative flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-xl p-2 focus-within:border-gray-300 focus-within:bg-white transition-colors">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600 shrink-0 mb-0.5">
               <Paperclip size={16} />
            </Button>
            
            <textarea 
               value={inputText}
               onChange={(e) => setInputText(e.target.value)}
               onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault();
                     handleSend();
                  }
               }}
               placeholder="Type a message..."
               className="flex-1 bg-transparent border-none text-sm resize-none max-h-[100px] focus:ring-0 focus:outline-none py-2 px-0 placeholder:text-gray-400"
               rows={1}
               style={{ minHeight: '36px' }} 
            />

            <Button 
               size="icon" 
               onClick={handleSend}
               disabled={!inputText.trim()}
               className={cn(
                  "h-8 w-8 shrink-0 mb-0.5 transition-all",
                  inputText.trim() ? "bg-[#E43632] text-white hover:bg-[#C12E2A]" : "bg-gray-200 text-gray-400"
               )}
            >
               <Send size={14} />
            </Button>
         </div>
      </div>

    </div>
  );
};
