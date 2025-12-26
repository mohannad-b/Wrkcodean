"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Search, Loader2, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

type ConversationItem = {
  conversationId: string;
  workflowId: string;
  workflowName: string;
  workflowStatus: string;
  tenantId: string;
  lastMessage: {
    id: string;
    body: string;
    senderType: "client" | "wrk" | "system";
    createdAt: string;
  } | null;
  unreadCount: number;
  updatedAt: string;
};

export function WrkInboxView() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    fetchConversations();
  }, [statusFilter]);

  const fetchConversations = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      const response = await fetch(`/api/wrk/inbox?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch conversations");
      }
      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredConversations = conversations.filter((conv) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        conv.workflowName.toLowerCase().includes(query) ||
        conv.lastMessage?.body.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const formatTime = (iso: string) => {
    try {
      return formatDistanceToNow(new Date(iso), { addSuffix: true });
    } catch {
      return iso;
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      IntakeInProgress: "bg-blue-100 text-blue-700",
      NeedsPricing: "bg-yellow-100 text-yellow-700",
      AwaitingClientApproval: "bg-purple-100 text-purple-700",
      ReadyForBuild: "bg-green-100 text-green-700",
      BuildInProgress: "bg-indigo-100 text-indigo-700",
      QATesting: "bg-orange-100 text-orange-700",
      Live: "bg-emerald-100 text-emerald-700",
      Archived: "bg-gray-100 text-gray-700",
    };
    return colors[status] || "bg-gray-100 text-gray-700";
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6 shrink-0">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-[#E43632]/10 text-[#E43632] rounded-lg">
              <MessageSquare size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#0A0A0A]">Wrk Inbox</h1>
              <p className="text-sm text-gray-500">All workflow conversations</p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <Input
                placeholder="Search workflows..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={statusFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("all")}
              >
                All
              </Button>
              <Button
                variant={statusFilter === "NeedsPricing" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("NeedsPricing")}
              >
                Needs Pricing
              </Button>
              <Button
                variant={statusFilter === "BuildInProgress" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("BuildInProgress")}
              >
                Building
              </Button>
              <Button
                variant={statusFilter === "QATesting" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("QATesting")}
              >
                QA
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full max-w-7xl mx-auto bg-white border-x border-gray-200">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No conversations found</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredConversations.map((conv) => (
                <Link
                  key={conv.conversationId}
                  href={`/admin/inbox/${conv.workflowId}`}
                  className="block hover:bg-gray-50 transition-colors"
                >
                  <div className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {conv.workflowName}
                        </h3>
                        <Badge
                          variant="outline"
                          className={cn("text-xs", getStatusColor(conv.workflowStatus))}
                        >
                          {conv.workflowStatus.replace(/([A-Z])/g, " $1").trim()}
                        </Badge>
                        {conv.unreadCount > 0 && (
                          <Badge className="bg-[#E43632] text-white text-xs">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                      {conv.lastMessage && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="font-medium">
                            {conv.lastMessage.senderType === "wrk"
                              ? "Wrk Team"
                              : conv.lastMessage.senderType === "client"
                              ? "Client"
                              : "System"}
                            :
                          </span>
                          <span className="truncate">{conv.lastMessage.body}</span>
                        </div>
                      )}
                      <div className="text-xs text-gray-400 mt-1">
                        {formatTime(conv.updatedAt)}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

