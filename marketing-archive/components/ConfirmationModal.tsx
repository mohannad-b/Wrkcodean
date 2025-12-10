import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  isDestructive?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  description, 
  confirmLabel = 'Confirm',
  isDestructive = false
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px] bg-white">
        <div className="flex flex-col items-center text-center pt-4">
           <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${isDestructive ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
              <AlertTriangle size={24} />
           </div>
           <DialogTitle className="text-lg font-bold text-[#0A0A0A] mb-2">
              {title}
           </DialogTitle>
           <DialogDescription className="text-center text-gray-500">
              {description}
           </DialogDescription>
        </div>
        <DialogFooter className="mt-6 sm:justify-center gap-2">
           <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
           <Button 
             onClick={() => { onConfirm(); onClose(); }} 
             className={`flex-1 ${isDestructive ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-[#0A0A0A] hover:bg-gray-800 text-white'}`}
           >
             {confirmLabel}
           </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
