import React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  className?: string;
}

export function EmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div className={cn("text-center py-8 text-gray-500", className)}>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {description ? <p className="text-xs text-gray-500 mt-1">{description}</p> : null}
    </div>
  );
}
