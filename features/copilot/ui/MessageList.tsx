import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface MessageListProps {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  scrollRef?: React.Ref<HTMLDivElement>;
  endRef?: React.Ref<HTMLDivElement>;
  onScrollCapture?: React.UIEventHandler<HTMLDivElement>;
}

export function MessageList({
  children,
  className,
  contentClassName,
  scrollRef,
  endRef,
  onScrollCapture,
}: MessageListProps) {
  return (
    <ScrollArea ref={scrollRef} className={cn("h-full", className)} onScrollCapture={onScrollCapture}>
      <div className={cn("flex flex-col gap-4", contentClassName)}>
        {children}
        <div ref={endRef} />
      </div>
    </ScrollArea>
  );
}
