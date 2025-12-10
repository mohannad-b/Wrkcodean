import React from 'react';
import { 
  Mail, 
  FileText, 
  Zap, 
  CheckSquare, 
  Split, 
  Bell, 
  Globe,
  LucideIcon,
  CheckCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Map icon names to components
export const HERO_ICON_MAP: Record<string, LucideIcon> = {
  'Mail': Mail,
  'FileText': FileText,
  'Zap': Zap,
  'CheckSquare': CheckSquare,
  'Split': Split,
  'Bell': Bell,
  'Globe': Globe,
  'CheckCircle': CheckCircle
};

interface HeroNodeProps {
  title: string;
  description: string;
  type: string;
  icon: string;
  status?: 'ai-suggested' | 'complete' | 'warning';
  selected?: boolean;
  className?: string;
}

export const HeroNode: React.FC<HeroNodeProps> = ({ 
  title, 
  description, 
  type, 
  icon, 
  status, 
  selected,
  className 
}) => {
  const Icon = HERO_ICON_MAP[icon] || Zap;
  
  return (
    <div className={cn(
      "w-[260px] bg-white rounded-xl border shadow-sm p-4 relative overflow-hidden text-left",
      selected 
        ? "border-gray-300 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)]" 
        : "border-gray-200",
      className
    )}>
      
      {/* Selection Highlight (Left Edge) */}
      <div className={cn(
        "absolute top-0 bottom-0 left-0 w-1 transition-colors duration-300",
        selected ? "bg-[#E43632]" : "bg-transparent"
      )} />

      {/* Fake Handles */}
      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-gray-300 border-2 border-white rounded-full" />
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-gray-300 border-2 border-white rounded-full" />

      {/* Node Header */}
      <div className="flex justify-between items-start mb-2 pl-2">
        <div className="flex gap-3 items-start">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors border",
            selected 
              ? "bg-[#E43632]/5 border-[#E43632]/20 text-[#E43632]" 
              : "bg-gray-50 border-gray-100 text-gray-500"
          )}>
            <Icon size={16} strokeWidth={2} />
          </div>
          
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{type}</span>
              {status === 'ai-suggested' && (
                <span className="text-[9px] font-semibold bg-blue-50 text-blue-600 px-1.5 rounded border border-blue-100">AI Draft</span>
              )}
              {status === 'complete' && (
                <span className="text-[9px] font-semibold bg-emerald-50 text-emerald-600 px-1.5 rounded border border-emerald-100">Ready</span>
              )}
            </div>
            <h4 className="text-sm font-bold text-[#0A0A0A] leading-tight">{title}</h4>
          </div>
        </div>
      </div>

      {/* Node Content */}
      <div className="pl-2">
        <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
};
