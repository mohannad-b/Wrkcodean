import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { 
  Mail, 
  FileText, 
  Zap, 
  CheckSquare, 
  Split, 
  Bell, 
  AlertTriangle, 
  CheckCircle2, 
  Sparkles,
  HelpCircle,
  Globe,
  LucideIcon
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

// Map icon names to components
const ICON_MAP: Record<string, LucideIcon> = {
  'Mail': Mail,
  'FileText': FileText,
  'Zap': Zap,
  'CheckSquare': CheckSquare,
  'Split': Split,
  'Bell': Bell,
  'Globe': Globe,
};

// Custom Node Component
const CustomNode = ({ data, selected }: NodeProps) => {
  const Icon = data.icon || Zap;
  const isAI = data.status === 'ai-suggested';
  const needsInfo = data.status === 'warning';

  return (
    <div className="relative group">
      {/* AI Hint / Tooltip (Above Node) */}
      {isAI && (
        <div className="absolute -top-8 left-0 right-0 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className="bg-white border border-gray-200 shadow-sm px-2 py-1 rounded-md text-[10px] text-gray-500 flex items-center gap-1">
            <Sparkles size={10} className="text-[#E43632]" />
            AI inferred this step
          </div>
        </div>
      )}

      {/* Needs Info Badge */}
      {needsInfo && (
         <div className="absolute -top-3 -right-2 z-30 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 shadow-sm flex items-center gap-1 text-[9px] font-bold animate-pulse">
           <AlertTriangle size={10} />
           Needs Info
         </div>
      )}

      <div className={cn(
        "w-[280px] bg-white rounded-xl border shadow-sm p-4 transition-all relative overflow-hidden",
        selected 
          ? "border-gray-300 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)]" 
          : "border-gray-200 hover:border-gray-300 hover:shadow-md"
      )}>
        
        {/* Selection Highlight (Left Edge) */}
        <div className={cn(
          "absolute top-0 bottom-0 left-0 w-1 transition-colors duration-300",
          selected ? "bg-[#E43632]" : "bg-transparent"
        )} />

        {/* Input Handle (Top) */}
        <Handle 
          type="target" 
          position={Position.Top} 
          className="!w-2.5 !h-2.5 !bg-gray-300 !border-2 !border-white transition-all hover:!bg-[#E43632] hover:!w-3.5 hover:!h-3.5" 
        />

        {/* Node Header */}
        <div className="flex justify-between items-start mb-3 pl-2">
          <div className="flex gap-3 items-start">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors border",
              selected 
                ? "bg-[#E43632]/5 border-[#E43632]/20 text-[#E43632]" 
                : "bg-gray-50 border-gray-100 text-gray-500 group-hover:text-[#E43632] group-hover:bg-red-50 group-hover:border-red-100"
            )}>
              <Icon size={16} strokeWidth={2} />
            </div>
            
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{data.type}</span>
                {/* Status Tag */}
                {data.status === 'ai-suggested' && (
                  <span className="text-[9px] font-semibold bg-blue-50 text-blue-600 px-1.5 rounded border border-blue-100">AI Draft</span>
                )}
                {data.status === 'complete' && (
                  <span className="text-[9px] font-semibold bg-emerald-50 text-emerald-600 px-1.5 rounded border border-emerald-100">Ready</span>
                )}
              </div>
              <h4 className="text-sm font-bold text-[#0A0A0A] leading-tight">{data.title}</h4>
            </div>
          </div>
        </div>

        {/* Node Content */}
        <div className="pl-2">
          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
            {data.description}
          </p>
        </div>

        {/* Output Handle (Bottom) */}
        <Handle 
          type="source" 
          position={Position.Bottom} 
          className="!w-2.5 !h-2.5 !bg-gray-300 !border-2 !border-white transition-all hover:!bg-[#E43632] hover:!w-3.5 hover:!h-3.5" 
        />
      </div>
    </div>
  );
};

export default memo(CustomNode);
