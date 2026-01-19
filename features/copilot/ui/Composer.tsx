import React from "react";
import { cn } from "@/lib/utils";

interface ComposerProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
}

export function Composer({ children, actions, footer, className, onSubmit }: ComposerProps) {
  return (
    <div className={cn("border-t border-gray-200 bg-white", className)}>
      <form onSubmit={onSubmit} className="flex items-end gap-2 px-4 py-3">
        <div className="flex-1">{children}</div>
        {actions}
      </form>
      {footer}
    </div>
  );
}
