"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Send, Lock, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageComposerProps {
  onSend: (text: string, isInternalNote: boolean) => void;
  className?: string;
}

export function MessageComposer({ onSend, className }: MessageComposerProps) {
  const [inputText, setInputText] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);

  const handleSend = () => {
    if (!inputText.trim()) return;
    onSend(inputText, isInternalNote);
    setInputText("");
    setIsInternalNote(false);
  };

  return (
    <div className={cn("bg-white border-t border-gray-200 p-4 z-10", className)}>
      <div
        className={cn(
          "relative rounded-xl border transition-colors",
          isInternalNote ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"
        )}
      >
        {isInternalNote && (
          <div className="absolute -top-2.5 left-3 bg-amber-100 text-amber-700 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1">
            <Lock size={8} /> Internal Note Mode
          </div>
        )}

        <Textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={isInternalNote ? "Add an internal note..." : "Message the client..."}
          className="w-full bg-transparent border-none text-sm p-3 min-h-[80px] resize-none focus:ring-0 focus:outline-none placeholder:text-gray-400"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleSend();
            }
          }}
        />

        <div className="flex justify-between items-center p-2 border-t border-gray-100/50">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-gray-600">
              <Paperclip size={16} />
            </Button>

            <div className="h-4 w-px bg-gray-200 mx-1" />

            <div
              className="flex items-center gap-2 ml-1 cursor-pointer"
              onClick={() => setIsInternalNote(!isInternalNote)}
            >
              <Switch checked={isInternalNote} className="scale-75" />
              <span
                className={cn(
                  "text-[10px] font-bold select-none",
                  isInternalNote ? "text-amber-600" : "text-gray-400"
                )}
              >
                Internal Note
              </span>
            </div>
          </div>

          <Button
            size="sm"
            onClick={handleSend}
            disabled={!inputText.trim()}
            className={cn(
              "h-8 px-4 transition-colors",
              isInternalNote
                ? "bg-amber-500 hover:bg-amber-600 text-white"
                : "bg-[#0A0A0A] hover:bg-gray-800 text-white"
            )}
          >
            <Send size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

