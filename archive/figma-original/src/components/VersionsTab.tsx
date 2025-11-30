import React, { useState } from 'react';
import { 
  History, 
  GitCompare, 
  CheckCircle, 
  RotateCcw, 
  ArrowUpCircle,
  MoreHorizontal,
  Calendar,
  User,
  FileText,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { currentUser } from '../data';

export const VersionsTab: React.FC = () => {
  const [showCompare, setShowCompare] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<any>(null);

  const versions = [
    {
      id: "v2.4",
      status: "Active",
      desc: "Updated approval threshold logic to $10k",
      date: "2 hours ago",
      user: currentUser,
      changes: ["Changed logic node condition", "Added Slack notification branch"]
    },
    {
      id: "v2.3",
      status: "Archived",
      desc: "Fixed Xero connection timeout issue",
      date: "2 days ago",
      user: { name: "Sarah", avatar: "" },
      changes: ["Added retry logic to API call"]
    },
    {
      id: "v2.2",
      status: "Archived",
      desc: "Initial production release",
      date: "1 week ago",
      user: { name: "Mike", avatar: "" },
      changes: ["Full workflow implementation"]
    }
  ];

  const handleCompare = (version: any) => {
    setSelectedVersion(version);
    setShowCompare(true);
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-[#0A0A0A]">Version History</h2>
          <p className="text-gray-500 text-sm mt-1">Manage deployments and rollbacks.</p>
        </div>
        <Button variant="outline" className="text-xs">
           <History size={14} className="mr-2" /> View Audit Log
        </Button>
      </div>

      <div className="space-y-4">
        {versions.map((version, idx) => (
          <div 
            key={version.id}
            className={`group flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 rounded-xl border transition-all ${
              version.status === 'Active' 
                ? "bg-white border-emerald-100 shadow-sm ring-1 ring-emerald-50" 
                : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
            }`}
          >
            <div className="flex items-start gap-4">
               <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                 version.status === 'Active' ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-400"
               }`}>
                  <FileText size={18} />
               </div>
               <div>
                 <div className="flex items-center gap-2 mb-1">
                   <h3 className="font-bold text-[#0A0A0A]">{version.id}</h3>
                   {version.status === 'Active' && (
                     <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 shadow-none text-[10px] uppercase tracking-wider">Current Active</Badge>
                   )}
                 </div>
                 <p className="text-sm text-gray-600 font-medium mb-1">{version.desc}</p>
                 <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Calendar size={12} /> {version.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <User size={12} /> 
                      {version.user.name || "Unknown"}
                    </span>
                 </div>
               </div>
            </div>

            <div className="mt-4 sm:mt-0 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
               <Button 
                 variant="ghost" 
                 size="sm" 
                 onClick={() => handleCompare(version)}
                 className="text-xs text-gray-500 hover:text-[#0A0A0A]"
               >
                 <GitCompare size={14} className="mr-1.5" /> Compare
               </Button>
               
               {version.status !== 'Active' && (
                 <>
                   <Button variant="outline" size="sm" className="text-xs h-8">
                     <RotateCcw size={12} className="mr-1.5" /> Rollback
                   </Button>
                   <Button size="sm" className="bg-[#0A0A0A] text-white text-xs h-8">
                     <ArrowUpCircle size={12} className="mr-1.5" /> Promote
                   </Button>
                 </>
               )}
            </div>
          </div>
        ))}
      </div>

      {/* Compare Modal */}
      <Dialog open={showCompare} onOpenChange={setShowCompare}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={18} className="text-[#E43632]" />
              AI Version Comparison
            </DialogTitle>
            <DialogDescription>
              Comparing <strong>v2.4 (Current)</strong> with <strong>{selectedVersion?.id}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Summary of Changes</h4>
              <div className="space-y-2">
                 <div className="flex items-start gap-2">
                    <div className="mt-1 p-1 bg-emerald-100 rounded-full text-emerald-700"><ArrowRight size={10} /></div>
                    <p className="text-sm text-gray-700">
                      <span className="font-bold">Logic Update:</span> The approval threshold was increased from $5,000 to $10,000. This will result in 40% fewer manual approvals.
                    </p>
                 </div>
                 <div className="flex items-start gap-2">
                    <div className="mt-1 p-1 bg-blue-100 rounded-full text-blue-700"><ArrowRight size={10} /></div>
                    <p className="text-sm text-gray-700">
                      <span className="font-bold">New Branch:</span> A Slack notification step was added for high-value invoices.
                    </p>
                 </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="p-3 border border-red-100 bg-red-50/50 rounded-lg">
                 <p className="text-xs font-bold text-red-800 mb-1">{selectedVersion?.id}</p>
                 <p className="text-xs text-gray-500 font-mono">IF amount &gt; 5000</p>
               </div>
               <div className="p-3 border border-emerald-100 bg-emerald-50/50 rounded-lg">
                 <p className="text-xs font-bold text-emerald-800">v2.4 (Current)</p>
                 <p className="text-xs text-gray-500 font-mono">IF amount &gt; 10000</p>
               </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowCompare(false)}>Close</Button>
            <Button variant="outline">View Full Diff</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
