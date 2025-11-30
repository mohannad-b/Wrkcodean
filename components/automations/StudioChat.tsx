"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Mic,
  Upload,
  AppWindow,
  MonitorPlay,
  Sparkles,
  AlertCircle,
  Paperclip,
  Wand2,
  MoveRight,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { currentUser } from "@/lib/mock-automations";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: string;
  isSystem?: boolean;
  suggestions?: string[];
}

interface StudioChatProps {
  isContributorMode?: boolean;
  onAiCommand?: (command: string) => void;
}

export function StudioChat({ isContributorMode = false, onAiCommand }: StudioChatProps) {
  const [messages, setMessages] = useState<Message[]>(
    isContributorMode
      ? [
          {
            id: "1",
            role: "ai",
            content: "Hi! Mo needs your help to complete the 'Finance Reconciliation' workflow.",
            timestamp: "10:00 AM",
          },
          {
            id: "2",
            role: "ai",
            content:
              "Could you please upload a screenshot of the invoice approval screen in NetSuite? This will help us understand the UI structure.",
            timestamp: "10:00 AM",
          },
        ]
      : [
          {
            id: "1",
            role: "ai",
            content: "I'm ready to help you build. What process are we automating today?",
            timestamp: "10:00 AM",
            suggestions: ["Invoice Processing", "Lead Routing", "Employee Onboarding"],
          },
          {
            id: "2",
            role: "user",
            content: "I need to automate invoice processing from email to Xero.",
            timestamp: "10:01 AM",
          },
          {
            id: "3",
            role: "ai",
            content:
              "I've drafted a flow: Email Trigger -> PDF Extraction -> Xero Draft. I inferred the email subject format as 'Invoice #[Number]'. Is that correct?",
            timestamp: "10:01 AM",
            suggestions: ["Add Approval Step", "Refine Trigger", "Show in Canvas"],
          },
        ]
  );
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const handleSend = (textOverride?: string) => {
    const content = typeof textOverride === "string" ? textOverride : input;
    if (!content.trim()) return;

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "user",
        content: content,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);

    if (!textOverride) {
      setInput("");
    }
    setIsThinking(true);

    setTimeout(() => {
      setIsThinking(false);
      if (onAiCommand) {
        onAiCommand(content);
      }
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "ai",
          content: "Understood. Updating the blueprint based on your feedback...",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          suggestions: ["Undo Changes", "Explain Logic"],
        },
      ]);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full bg-[#F9FAFB] border-r border-gray-200 overflow-hidden">
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
          {isContributorMode && (
            <Badge
              variant="secondary"
              className="ml-auto text-[10px] bg-blue-50 text-blue-600 border-blue-100 px-2 py-0.5"
            >
              Contributor Mode
            </Badge>
          )}
        </div>

        {/* Quick Actions Row */}
        {!isContributorMode && (
          <div className="grid grid-cols-4 gap-2 mt-1">
            <QuickAction icon={Upload} label="Upload" />
            <QuickAction icon={MonitorPlay} label="Record" />
            <QuickAction icon={AppWindow} label="Connect" />
            <QuickAction icon={Mic} label="Voice" />
          </div>
        )}

        {/* Contributor Task List */}
        {isContributorMode && (
          <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 space-y-3 mt-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">
                Your Tasks (2)
              </p>
              <span className="text-[10px] text-blue-600 font-medium">0% Complete</span>
            </div>
            <div className="space-y-2">
              <TaskItem label="Upload NetSuite screenshot" type="upload" />
              <TaskItem label="Connect Xero Account" type="connect" />
            </div>
          </div>
        )}
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

              <div
                className={`max-w-[85%] space-y-2 ${msg.role === "user" ? "items-end flex flex-col" : ""}`}
              >
                <div
                  className={`p-4 text-sm shadow-sm relative leading-relaxed ${
                    msg.role === "user"
                      ? "bg-white text-[#0A0A0A] rounded-2xl rounded-tr-sm border border-gray-200"
                      : "bg-[#F3F4F6] text-[#0A0A0A] rounded-2xl rounded-tl-sm border border-transparent"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>

                {/* AI Suggestions Chips */}
                {msg.role === "ai" && msg.suggestions && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {msg.suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSend(s)}
                        className="text-[10px] font-medium bg-white border border-gray-200 text-gray-600 px-2 py-1 rounded-full hover:border-[#E43632] hover:text-[#E43632] transition-colors flex items-center gap-1"
                      >
                        {s} <MoveRight size={8} />
                      </button>
                    ))}
                  </div>
                )}

                <span className="text-[10px] text-gray-400 px-1 block">{msg.timestamp}</span>
              </div>
            </motion.div>
          ))}

          {/* AI Thinking Indicator */}
          {isThinking && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[#E43632] shadow-sm shrink-0">
                <Sparkles size={14} />
              </div>
              <div className="bg-[#F3F4F6] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </motion.div>
          )}
          <div ref={scrollEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200">
        {/* Micro-panel / Prompt Suggestion */}
        {!isContributorMode && messages.length < 3 && (
          <div
            className="mb-3 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-between group cursor-pointer hover:bg-red-50 hover:border-red-100 transition-colors"
            onClick={() =>
              setInput("Our sales process starts when a lead comes from Facebook ads...")
            }
          >
            <p className="text-xs text-gray-500 group-hover:text-[#E43632] transition-colors truncate pr-2">
              <span className="font-bold mr-1">Try:</span>
              &quot;Our sales process starts when a lead comes from Facebook ads...&quot;
            </p>
            <Wand2 size={12} className="text-gray-300 group-hover:text-[#E43632]" />
          </div>
        )}

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
              isContributorMode ? "Reply to task..." : "Describe your workflow change..."
            }
            className="w-full bg-white text-[#0A0A0A] placeholder:text-gray-400 text-sm rounded-xl py-3 pl-10 pr-12 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#E43632]/10 focus:border-[#E43632] transition-all shadow-sm hover:border-gray-300"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim()}
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

function TaskItem({ label, type }: { label: string; type: "upload" | "connect" }) {
  return (
    <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-blue-100 shadow-sm group hover:border-blue-300 transition-colors cursor-pointer">
      <div className="flex items-center gap-2">
        <div
          className={`p-1.5 rounded-md ${type === "upload" ? "bg-purple-50 text-purple-600" : "bg-amber-50 text-amber-600"}`}
        >
          {type === "upload" ? <Upload size={12} /> : <AlertCircle size={12} />}
        </div>
        <span className="text-xs font-medium text-gray-700">{label}</span>
      </div>
      <div className="w-4 h-4 rounded-full border-2 border-gray-200 group-hover:border-blue-500 transition-colors" />
    </div>
  );
}
