import React from 'react';
import { Project } from '../data';
import { MoreHorizontal, Clock, Copy, Box } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface ProjectCardProps {
  project: Project;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live': return 'bg-emerald-500 text-emerald-700 border-emerald-200';
      case 'preview': return 'bg-blue-500 text-blue-700 border-blue-200';
      case 'draft': return 'bg-amber-500 text-amber-700 border-amber-200';
      default: return 'bg-gray-500 text-gray-700 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
     switch (status) {
      case 'live': return 'Live Mode';
      case 'preview': return 'Preview';
      case 'draft': return 'Draft';
      default: return status;
    }
  };

  const getHealthIndicator = (health: string) => {
     switch (health) {
      case 'healthy': return 'bg-emerald-500';
      case 'warning': return 'bg-yellow-400';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-300';
    }
  };

  return (
    <motion.div 
      whileHover={{ y: -2, boxShadow: "0 10px 30px -10px rgba(228, 54, 50, 0.15)" }}
      className="group relative bg-white rounded-xl p-5 shadow-sm border border-gray-100 transition-all duration-200 hover:border-[#E43632]/20 flex flex-col h-full"
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
             <div className="w-8 h-8 bg-[#F5F5F5] rounded-lg flex items-center justify-center text-gray-600 group-hover:text-[#E43632] transition-colors">
               <Box size={16} strokeWidth={2.5} />
             </div>
             <div className={cn("absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white", getHealthIndicator(project.health))} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-opacity-10 border", getStatusColor(project.status))}>
            {getStatusLabel(project.status)}
          </span>
          <button className="text-gray-300 hover:text-gray-600 transition-colors">
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      <h3 className="text-base font-bold text-[#0A0A0A] mb-1.5 leading-tight group-hover:text-[#E43632] transition-colors">
        {project.name}
      </h3>
      <p className="text-sm text-gray-500 mb-4 line-clamp-2 leading-relaxed">
        {project.description}
      </p>

      <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
         <div className="flex -space-x-2">
          {project.collaborators.length > 0 ? (
            project.collaborators.map((collab) => (
              <Avatar key={collab.id} className="w-6 h-6 border border-white ring-1 ring-gray-50">
                <AvatarImage src={collab.avatar} alt={collab.name} />
                <AvatarFallback className="text-[10px]">{collab.name.charAt(0)}</AvatarFallback>
              </Avatar>
            ))
          ) : (
             <span className="text-xs text-gray-400">No team</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs text-gray-400" title="Current Version">
             <Copy size={12} />
             <span>Active Version</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400" title="Last Updated">
            <Clock size={12} />
            <span>{project.lastUpdated}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
