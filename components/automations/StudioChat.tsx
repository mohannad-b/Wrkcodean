"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Send, Mic, Upload, AppWindow, MonitorPlay, Sparkles, AlertCircle, Paperclip } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { currentUser } from "@/lib/mock-automations";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface CopilotMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: string;
}

interface StudioChatProps {
  blueprintEmpty: boolean;
  onDraftBlueprint: (messages: CopilotMessage[]) => Promise<void>;
  isDrafting: boolean;
  disabled?: boolean;
  lastError?: string | null;
  onConversationChange?: (messages: CopilotMessage[]) => void;
}

const INITIAL_AI_MESSAGE: CopilotMessage = {
  id: "ai-initial",
  role: "ai",
  content: "Tell me about the workflow you want to automate. I'll draft the blueprint once you're ready.",
  timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
};

export function StudioChat({
  blueprintEmpty,
  onDraftBlueprint,
  isDrafting,
  disabled = false,
  lastError,
  onConversationChange,
}: StudioChatProps) {
  const [messages, setMessages] = useState<CopilotMessage[]>([INITIAL_AI_MESSAGE]);
  const [input, setInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const prevBlueprintEmptyRef = useRef<boolean>(blueprintEmpty);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (prevBlueprintEmptyRef.current && !blueprintEmpty) {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "ai",
          content: "Draft created. Review the canvas and click any step to refine details.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    }
    prevBlueprintEmptyRef.current = blueprintEmpty;
  }, [blueprintEmpty]);

  useEffect(() => {
    onConversationChange?.(messages);
  }, [messages, onConversationChange]);

  const hasUserMessage = useMemo(() => messages.some((message) => message.role === "user"), [messages]);
  const canDraft = blueprintEmpty && hasUserMessage && !isDrafting && !disabled;
  const helperMessage = blueprintEmpty
    ? "Share the workflow, systems, and exception cases so the draft is accurate."
    : "Blueprint synced with Copilot. Keep refining via chat or the inspector.";

  const handleSend = () => {
    const content = input.trim();
    if (!content) return;

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "user",
        content,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);

    setInput("");
    setLocalError(null);
  };

  const handleDraft = async () => {
    if (!hasUserMessage) {
      setLocalError("Add at least one message before drafting.");
      return;
    }
    setLocalError(null);
    await onDraftBlueprint(messages);
  };

  return (
    <div className="flex flex-col h-full bg-[#F9FAFB] border-r border-gray-200 overflow-hidden" data-testid="copilot-pane">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white flex flex-col gap-3 shadow-sm z-10">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-br from-[#E43632] to-[#FF5F5F] text-white p-1.5 rounded-lg shadow-sm animate-pulse">
            <Sparkles size={16} fill="currentColor" />
          </div>
          <div>
            <span className="font-bold text-sm text-[#0A0A0A] block leading-none">WRK Copilot</span>
            <span className="text-[10px] text-gray-400 font-medium">AI Assistant</span>
          </div>
          <Badge variant="secondary" className="ml-auto text-[10px] bg-gray-100 text-gray-600 border-gray-200 px-2 py-0.5">
            {blueprintEmpty ? "Draft Needed" : "Blueprint Synced"}
          </Badge>
        </div>

        {/* Quick Actions Row */}
        <div className="grid grid-cols-4 gap-2 mt-1">
          <QuickAction icon={Upload} label="Upload" />
          <QuickAction icon={MonitorPlay} label="Record" />
          <QuickAction icon={AppWindow} label="Connect" />
          <QuickAction icon={Mic} label="Voice" />
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-[11px] text-gray-500">{helperMessage}</div>
          {blueprintEmpty && (
            <Button size="sm" onClick={handleDraft} disabled={!canDraft} className="justify-center text-xs font-semibold">
              {isDrafting ? "Drafting Blueprint…" : "Draft Blueprint with Copilot"}
            </Button>
          )}
          {(localError || lastError) && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 flex items-center gap-1">
              <AlertCircle size={12} />
              {localError || lastError}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <ScrollArea className="flex-1 min-h-0 px-4 py-4 bg-[#F9FAFB]">
        <div className="space-y-6 pb-4">
          {messages.map((msg) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={msg.id}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              {msg.role === "ai" && (
                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[#E43632] shadow-sm shrink-0 mt-0.5">
                  <Sparkles size={14} />
                </div>
              )}
              {msg.role === "user" && (
                <Avatar className="w-8 h-8 mt-0.5 border-2 border-white shadow-sm shrink-0">
                  <AvatarImage src={currentUser.avatar} />
                  <AvatarFallback>ME</AvatarFallback>
                </Avatar>
              )}

              <div className={`max-w-[85%] space-y-2 ${msg.role === "user" ? "items-end flex flex-col" : ""}`}>
                <div
                  className={`p-4 text-sm shadow-sm relative leading-relaxed ${
                    msg.role === "user"
                      ? "bg-white text-[#0A0A0A] rounded-2xl rounded-tr-sm border border-gray-200"
                      : "bg-[#F3F4F6] text-[#0A0A0A] rounded-2xl rounded-tl-sm border border-transparent"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>

                <span className="text-[10px] text-gray-400 px-1 block">{msg.timestamp}</span>
              </div>
            </motion.div>
          ))}
          <div ref={scrollEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200">
        <div className="relative flex items-center">
          <div className="absolute left-2 flex items-center gap-1">
            <button className="p-1.5 text-gray-400 hover:text-[#0A0A0A] hover:bg-gray-100 rounded-md transition-colors">
              <Paperclip size={16} />
            </button>
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={
              blueprintEmpty ? "Describe the workflow, systems, and exceptions..." : "Capture refinements or clarifications..."
            }
            className="w-full bg-white text-[#0A0A0A] placeholder:text-gray-400 text-sm rounded-xl py-3 pl-10 pr-12 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#E43632]/10 focus:border-[#E43632] transition-all shadow-sm hover:border-gray-300"
            disabled={disabled}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || disabled}
            className="absolute right-1.5 p-2 bg-[#E43632] text-white rounded-lg hover:bg-[#C12E2A] transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
}) {
  return (
    <button className="flex flex-col items-center justify-center gap-1.5 py-2.5 bg-white border border-gray-200 rounded-xl hover:border-[#E43632] hover:text-[#E43632] hover:bg-[#E43632]/5 transition-all group shadow-sm">
      <Icon size={16} className="text-gray-500 group-hover:text-[#E43632] transition-colors" />
      <span className="text-[10px] font-bold text-gray-600 group-hover:text-[#E43632] transition-colors">
        {label}
      </span>
    </button>
  );
}
