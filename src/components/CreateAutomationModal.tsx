import React, { useState } from 'react';
import { X, Zap, FileText, Bot, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

interface CreateAutomationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: any) => void;
}

const TEMPLATES = [
  { id: 'blank', title: 'Start from Scratch', icon: Zap, desc: 'Build manually with the visual editor.' },
  { id: 'invoice', title: 'Invoice Processing', icon: FileText, desc: 'Extract data from PDFs to Xero.' },
  { id: 'support', title: 'Support Triaging', icon: Bot, desc: 'Classify and route Zendesk tickets.' },
];

export const CreateAutomationModal: React.FC<CreateAutomationModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [step, setStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = () => {
    setIsLoading(true);
    setTimeout(() => {
      onCreate({ name, template: selectedTemplate });
      setIsLoading(false);
      onClose();
      setStep(1);
      setName('');
      setSelectedTemplate(null);
    }, 1000);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden bg-white border-none shadow-2xl">
        <div className="p-6 border-b border-gray-100">
          <DialogTitle className="text-xl font-bold text-[#0A0A0A]">
            {step === 1 ? 'Choose a starting point' : 'Name your automation'}
          </DialogTitle>
        </div>

        <div className="p-6 min-h-[300px]">
          {step === 1 ? (
            <div className="grid grid-cols-1 gap-4">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t.id)}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-xl border text-left transition-all hover:shadow-md group",
                    selectedTemplate === t.id 
                      ? "border-[#E43632] bg-red-50/10 ring-1 ring-[#E43632]" 
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                    selectedTemplate === t.id ? "bg-[#E43632] text-white" : "bg-gray-100 text-gray-500 group-hover:bg-gray-200"
                  )}>
                    <t.icon size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#0A0A0A] mb-1">{t.title}</h3>
                    <p className="text-sm text-gray-500">{t.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Automation Name</label>
                <Input 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Monthly Expense Approval"
                  className="text-lg py-6"
                  autoFocus
                />
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 flex gap-3">
                 <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                    <Bot size={16} />
                 </div>
                 <div>
                    <p className="text-xs font-bold text-gray-900 mb-1">AI Copilot Tip</p>
                    <p className="text-xs text-gray-500">
                      Give your automation a clear, descriptive name so your team can easily find it later.
                    </p>
                 </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          {step === 2 ? (
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
          ) : (
            <div />
          )}
          
          <Button 
            onClick={() => step === 1 ? setStep(2) : handleCreate()}
            disabled={step === 1 ? !selectedTemplate : !name}
            className="bg-[#E43632] hover:bg-[#C12E2A] text-white font-bold shadow-lg shadow-red-500/20"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                {step === 1 ? 'Next' : 'Create Automation'}
                {step === 1 && <ArrowRight size={16} className="ml-2" />}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
