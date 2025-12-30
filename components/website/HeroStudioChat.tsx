'use client';

import React, { useRef, useEffect } from 'react';
import { Sparkles, Send, MoveRight } from "lucide-react";
import { ScrollArea } from "../ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { currentUser } from "@/marketing/data";
import { motion } from 'motion/react';

const exampleImage = "/assets/invoice.png";

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
  isSystem?: boolean;
  suggestions?: string[];
}

interface HeroStudioChatProps {
  messages: Message[];
  isThinking?: boolean;
  step: number;
}

export const HeroStudioChat: React.FC<HeroStudioChatProps> = ({ messages, isThinking = false, step }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  
  // Animation States
  const [displayMessages, setDisplayMessages] = React.useState<Message[]>(messages);
  const [inputValue, setInputValue] = React.useState('');
  const [showScreenshot, setShowScreenshot] = React.useState(false);
  const [isSimulating, setIsSimulating] = React.useState(false);

  // Sync messages when step changes (but handle step 1 specifically)
  useEffect(() => {
    if (step === 1) {
        // Start simulation for Step 1
        const userMsg = messages.find(m => m.role === 'user');
        const aiMsg = messages.filter(m => m.role === 'ai');
        
        // Initially show only AI greeting
        setDisplayMessages(aiMsg);
        setInputValue('');
        setShowScreenshot(false);
        setIsSimulating(true);

        if (!userMsg) return;

        // 1. Type text (0ms - 2000ms)
        let currentText = '';
        const targetText = userMsg.content;
        const totalTypingTime = 2000;
        const charTime = totalTypingTime / targetText.length;
        
        let charIndex = 0;
        const typeInterval = setInterval(() => {
            if (charIndex < targetText.length) {
                currentText += targetText[charIndex];
                setInputValue(currentText);
                charIndex++;
            } else {
                clearInterval(typeInterval);
            }
        }, charTime);

        // 2. Simulate Screenshot Upload (2200ms)
        const uploadTimeout = setTimeout(() => {
            setShowScreenshot(true);
        }, 2200);

        // 3. Send Message (3500ms)
        const sendTimeout = setTimeout(() => {
            setInputValue('');
            setShowScreenshot(false);
            setDisplayMessages(messages); // Show all messages including user's
            setIsSimulating(false);
        }, 3500);

        return () => {
            clearInterval(typeInterval);
            clearTimeout(uploadTimeout);
            clearTimeout(sendTimeout);
        };
    } else {
        // For other steps, ensure we have the full conversation history
        // Step 1's "final state" is effectively "messagesStart" from HeroWorkflow.
        // If messages here are from "messagesBuild", they ALREADY contain the user message.
        // We just need to make sure we don't accidentally "hide" the user message.
        
        // However, if we transition from Step 1 (simulating) to Step 2,
        // we want to make sure the user message is visible.
        // messages passed in props for Step 2 (messagesBuild) already include the user message.
        
        setDisplayMessages(messages);
        setInputValue('');
        setShowScreenshot(false);
        setIsSimulating(false);
        return;
    }
    return;
  }, [messages, step]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      } else {
         messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [displayMessages, isThinking]);

  return (
    <div className="flex flex-col h-full bg-[#F9FAFB] border-r border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white flex flex-col gap-3 shadow-sm z-10">
        <div className="flex items-center gap-2">
           <div className="bg-gradient-to-br from-[#E43632] to-[#FF5F5F] text-white p-1.5 rounded-lg shadow-sm">
             <Sparkles size={16} fill="currentColor" />
           </div>
           <div>
             <span className="font-bold text-sm text-[#0A0A0A] block leading-none">WRK Copilot</span>
             <span className="text-[10px] text-gray-400 font-medium">AI Assistant</span>
           </div>
        </div>

        {/* Quick Actions Row - REMOVED */
         /* <div className="grid grid-cols-4 gap-2 mt-1">
            <QuickAction icon={Upload} label="Upload" />
            <QuickAction icon={MonitorPlay} label="Record" />
            <QuickAction icon={AppWindow} label="Connect" />
            <QuickAction icon={Mic} label="Voice" />
        </div> */}
      </div>

      {/* Chat Area */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0 px-4 py-4 bg-[#F9FAFB]">
        <div className="space-y-6 pb-4">
          {displayMessages.map((msg) => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              key={msg.id} 
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {msg.role === 'ai' && (
                 <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[#E43632] shadow-sm shrink-0 mt-0.5">
                    <Sparkles size={14} />
                 </div>
              )}
              {msg.role === 'user' && (
                 <Avatar className="w-8 h-8 mt-0.5 border-2 border-white shadow-sm shrink-0">
                    <AvatarImage src={currentUser.avatar} />
                    <AvatarFallback>ME</AvatarFallback>
                 </Avatar>
              )}
              
              <div className={`max-w-[85%] space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col' : ''}`}>
                 <div className={`p-4 text-sm shadow-sm relative leading-relaxed ${
                   msg.role === 'user' 
                     ? 'bg-white text-[#0A0A0A] rounded-2xl rounded-tr-sm border border-gray-200' 
                     : 'bg-[#F3F4F6] text-[#0A0A0A] rounded-2xl rounded-tl-sm border border-transparent'
                 }`}>
                   <p className="whitespace-pre-wrap">{msg.content}</p>
                 </div>

                 {/* Render screenshot in the sent message if it's the user message. */}
                 {msg.role === 'user' && (
                    <div className="mt-1 rounded-lg overflow-hidden border border-gray-200 w-32 h-20 bg-gray-100 relative group">
                        <img src={exampleImage} alt="Invoice" className="w-full h-full object-cover opacity-90" />
                    </div>
                 )}
                 
                 {/* AI Suggestions Chips */}
                 {msg.role === 'ai' && msg.suggestions && (
                   <div className="flex flex-wrap gap-1.5 mt-1">
                     {msg.suggestions.map(s => (
                       <button 
                         key={s} 
                         className="text-[10px] font-medium bg-white border border-gray-200 text-gray-600 px-2 py-1 rounded-full hover:border-[#E43632] hover:text-[#E43632] transition-colors flex items-center gap-1 cursor-default"
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
          {isThinking && !isSimulating && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              className="flex gap-3"
            >
               <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[#E43632] shadow-sm shrink-0">
                  <Sparkles size={14} />
               </div>
               <div className="bg-[#F3F4F6] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                 <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                 <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                 <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
               </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 pb-8 bg-white border-t border-gray-200">
        <div className="relative flex items-center" suppressHydrationWarning>
          {/* Simulated Screenshot Preview in Input */}
          {showScreenshot && (
             <div className="absolute left-3 top-1/2 -translate-y-1/2 bg-gray-100 border border-gray-200 rounded px-2 py-1 flex items-center gap-1 z-10 animate-in zoom-in">
                <img src={exampleImage} alt="Invoice" className="w-3 h-3 rounded-sm object-cover" />
                <span className="text-[10px] text-gray-500">invoice.pdf</span>
             </div>
          )}
          
          <input
            type="text"
            readOnly
            value={inputValue}
            placeholder={isSimulating ? "" : "AI is building your workflow..."}
            className={`w-full bg-white text-[#0A0A0A] placeholder:text-gray-400 text-sm rounded-xl py-3 pr-12 border border-gray-200 focus:outline-none transition-all ${showScreenshot ? 'pl-24' : 'pl-4'}`}
            suppressHydrationWarning
          />
          <button 
            disabled
            className={`absolute right-1.5 p-2 rounded-lg transition-colors ${inputValue.length > 0 ? 'bg-[#E43632] text-white' : 'bg-gray-100 text-gray-400'}`}
            suppressHydrationWarning
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

// QuickAction removed; quick actions row is commented out
