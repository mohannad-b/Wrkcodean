import React from 'react';
import { Notification, notifications } from '../data';
import { 
  Bell, 
  FileSignature, 
  History, 
  Zap, 
  MessageSquare 
} from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

export const RightPanel: React.FC = () => {
  return (
    <div className="hidden xl:flex flex-col w-80 bg-white h-screen border-l border-gray-100 fixed right-0 top-0 z-40">
      {/* Header */}
      <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <h3 className="font-bold text-[#0A0A0A] text-sm uppercase tracking-wide">Activity Feed</h3>
        <div className="relative cursor-pointer hover:bg-gray-50 p-1.5 rounded-full transition-colors">
          <Bell size={16} className="text-gray-500" />
          {notifications.some(n => n.isUnread) && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#E43632] rounded-full ring-2 ring-white"></span>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          
          {/* Section: Needs Attention */}
          <div>
            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 pl-2">
              Needs Review
            </h4>
            <div className="space-y-3">
              {notifications.filter(n => n.type === 'review').map(note => (
                <NotificationItem key={note.id} note={note} />
              ))}
            </div>
          </div>

          {/* Section: Recent */}
          <div>
            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3 pl-2">
              What Changed
            </h4>
            <div className="space-y-3">
              {notifications.filter(n => n.type !== 'review').map(note => (
                <NotificationItem key={note.id} note={note} />
              ))}
            </div>
          </div>

        </div>
      </ScrollArea>
      
      <div className="p-4 border-t border-gray-100 bg-gray-50/50">
         <button className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-[#E43632] transition-colors">
            View Full History
         </button>
      </div>
    </div>
  );
};

const NotificationItem: React.FC<{ note: Notification }> = ({ note }) => {
  const getIcon = () => {
    switch (note.type) {
      case 'review': return <FileSignature size={14} className="text-amber-500" />;
      case 'update': return <History size={14} className="text-blue-500" />;
      case 'publish': return <Zap size={14} className="text-emerald-500" />;
      case 'comment': return <MessageSquare size={14} className="text-gray-500" />;
    }
  };

  const getTypeLabel = () => {
      switch (note.type) {
      case 'review': return 'Review Request';
      case 'update': return 'Update Saved';
      case 'publish': return 'Went Live';
      case 'comment': return 'Comment';
    }
  }

  return (
    <div className="group relative flex gap-3 p-3 rounded-lg hover:bg-gray-50 transition-all cursor-pointer border border-transparent hover:border-gray-100">
       {note.isUnread && (
         <div className="absolute left-1 top-4 w-1 h-1 rounded-full bg-[#E43632]" />
       )}
       
       <div className="shrink-0 mt-0.5">
         {note.actor ? (
            <Avatar className="w-8 h-8 border border-gray-200">
              <AvatarImage src={note.actor.avatar} />
              <AvatarFallback>{note.actor.name[0]}</AvatarFallback>
            </Avatar>
         ) : (
            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
              {getIcon()}
            </div>
         )}
       </div>

       <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
             <span className="text-[10px] font-medium text-gray-400 uppercase">{getTypeLabel()}</span>
             <span className="text-[10px] text-gray-300">{note.time}</span>
          </div>
          <p className="text-sm font-semibold text-[#0A0A0A] leading-tight mb-1 group-hover:text-[#E43632] transition-colors">
            {note.title}
          </p>
          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
            {note.message}
          </p>
       </div>
    </div>
  );
};
