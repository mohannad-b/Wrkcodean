import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { ActivityItem } from "@/lib/mock-dashboard";

interface ActivityFeedItemProps {
  item: ActivityItem;
}

export function ActivityFeedItem({ item }: ActivityFeedItemProps) {
  return (
    <div className="p-4 flex gap-3 hover:bg-gray-50 transition-colors group">
      <Avatar className="h-8 w-8 border border-gray-100">
        <AvatarImage src={item.avatar} />
        <AvatarFallback className="bg-gray-100 text-xs font-bold text-gray-500">
          {item.user.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">
          <span className="font-bold text-[#0A0A0A]">{item.user}</span>{" "}
          {item.action.replace("_", " ")}
        </p>
        <p className="text-xs font-medium text-[#0A0A0A] truncate mb-1">{item.target}</p>
        <p className="text-[10px] text-gray-400">{item.time}</p>
      </div>
    </div>
  );
}



