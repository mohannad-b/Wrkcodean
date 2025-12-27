import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { ActivityItem } from "@/lib/mock-dashboard";

interface ActivityFeedItemProps {
  item: ActivityItem;
}

function hasNameFields(
  item: ActivityItem
): item is ActivityItem & { userFirstName: string; userLastName: string } {
  return (
    "userFirstName" in item &&
    "userLastName" in item &&
    typeof (item as any).userFirstName === "string" &&
    typeof (item as any).userLastName === "string"
  );
}

export function ActivityFeedItem({ item }: ActivityFeedItemProps) {
  const getUserInitials = () => {
    const userName = typeof item.user === "string" ? item.user : "";
    if (hasNameFields(item)) {
      return `${item.userFirstName.charAt(0)}${item.userLastName.charAt(0)}`.toUpperCase();
    }
    return (userName || "U").charAt(0).toUpperCase();
  };

  const avatarUrl =
    "userAvatarUrl" in item && typeof item.userAvatarUrl === "string" ? item.userAvatarUrl : item.avatar;
  const userDisplay = typeof item.user === "string" ? item.user : "";

  return (
    <div className="p-4 flex gap-3 hover:bg-gray-50 transition-colors group">
      <Avatar className="h-8 w-8 border border-gray-100">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={userDisplay} /> : null}
        <AvatarFallback className="bg-gray-100 text-xs font-bold text-gray-500">
          {getUserInitials()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 mb-0.5">
          <span className="font-bold text-[#0A0A0A]">{userDisplay}</span>{" "}
          {item.action.replace("_", " ")}
        </p>
        <p className="text-xs font-medium text-[#0A0A0A] truncate mb-1">{item.target}</p>
        <p className="text-[10px] text-gray-400">{item.time}</p>
      </div>
    </div>
  );
}




