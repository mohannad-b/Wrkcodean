import React from 'react';
import { MousePointer2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CursorProps {
  name: string;
  color: string;
  x: number;
  y: number;
  message?: string;
  className?: string;
}

export const Cursor: React.FC<CursorProps> = ({ name, color, x, y, message, className }) => {
  return (
    <div 
      className={cn("absolute z-50 pointer-events-none transition-all duration-700 ease-in-out", className)}
      style={{ left: x, top: y }}
    >
      <MousePointer2 
        className="h-5 w-5 -ml-[5px] -mt-[2px]" 
        style={{ fill: color, color: color }} 
      />
      <div 
        className="ml-2 px-2 py-1 rounded-md text-[10px] font-bold text-white shadow-sm whitespace-nowrap flex items-center gap-2"
        style={{ backgroundColor: color }}
      >
        {name}
        {message && (
          <span className="opacity-90 font-normal border-l border-white/20 pl-2 ml-1">
            {message}
          </span>
        )}
      </div>
    </div>
  );
};
