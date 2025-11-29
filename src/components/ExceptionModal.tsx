import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface ExceptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (rule: { condition: string; outcome: string }) => void;
}

export const ExceptionModal: React.FC<ExceptionModalProps> = ({ isOpen, onClose, onAdd }) => {
  const [condition, setCondition] = useState('');
  const [outcome, setOutcome] = useState('');

  const handleAdd = () => {
    if (condition && outcome) {
      onAdd({ condition, outcome });
      onClose();
      setCondition('');
      setOutcome('');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-[480px] bg-white rounded-2xl shadow-2xl overflow-hidden p-8"
          >
             <div className="flex justify-between items-start mb-8">
               <div>
                 <h3 className="font-bold text-2xl text-[#0A0A0A] mb-1">Add an Exception</h3>
                 <p className="text-gray-500 text-sm">Define how the workflow should handle edge cases.</p>
               </div>
               <button onClick={onClose} className="text-gray-400 hover:text-[#0A0A0A] transition-colors">
                 <X size={24} />
               </button>
             </div>

             <div className="space-y-6">
               {/* Step 1: Condition */}
               <div className="space-y-2.5">
                 <label className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-2">
                   <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[10px]">1</span>
                   If this happens...
                 </label>
                 <Select onValueChange={setCondition}>
                    <SelectTrigger className="h-12 bg-white border-gray-200 hover:border-gray-300 text-sm shadow-sm rounded-lg">
                      <SelectValue placeholder="Select a condition..." />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      <SelectItem value="Missing Info">Missing required info</SelectItem>
                      <SelectItem value="Amount > Threshold">Amount greater than...</SelectItem>
                      <SelectItem value="Customer Not Found">Customer not found</SelectItem>
                      <SelectItem value="Unreadable Document">Unreadable document</SelectItem>
                      <SelectItem value="Delay or Timeout">Delay or timeout</SelectItem>
                      <SelectItem value="Contains Keyword">Contains keyword</SelectItem>
                    </SelectContent>
                 </Select>
               </div>

               {/* Step 2: Outcome */}
               <div className="space-y-2.5">
                 <label className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-2">
                   <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[10px]">2</span>
                   Then do this...
                 </label>
                 <Select onValueChange={setOutcome}>
                    <SelectTrigger className="h-12 bg-white border-gray-200 hover:border-gray-300 text-sm shadow-sm rounded-lg">
                      <SelectValue placeholder="Select an outcome..." />
                    </SelectTrigger>
                    <SelectContent className="z-[200]">
                      <SelectItem value="Route to Review">Route to Review</SelectItem>
                      <SelectItem value="Request Approval">Request Approval</SelectItem>
                      <SelectItem value="Notify Team">Notify Team</SelectItem>
                      <SelectItem value="Skip Step">Skip Step</SelectItem>
                      <SelectItem value="Retry Step">Retry Step</SelectItem>
                      <SelectItem value="Pause Workflow">Pause Workflow</SelectItem>
                    </SelectContent>
                 </Select>
               </div>

               {/* Step 3: Notes */}
               <div className="space-y-2.5">
                  <label className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-[10px]">3</span>
                    Notes (Optional)
                  </label>
                  <Textarea 
                    placeholder="Add extra context for the team..." 
                    className="resize-none min-h-[80px] bg-white border-gray-200 hover:border-gray-300 rounded-lg text-sm p-3" 
                  />
               </div>

               <div className="pt-2 flex gap-3">
                 <Button 
                   onClick={onClose}
                   variant="outline"
                   className="flex-1 h-11 font-bold border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-[#0A0A0A]"
                 >
                   Cancel
                 </Button>
                 <Button 
                   onClick={handleAdd}
                   disabled={!condition || !outcome}
                   className="flex-[2] h-11 bg-[#E43632] hover:bg-[#C12E2A] text-white font-bold shadow-lg shadow-red-500/20"
                 >
                   Add Exception
                 </Button>
               </div>
             </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
