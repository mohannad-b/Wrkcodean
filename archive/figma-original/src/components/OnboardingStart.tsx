import React from 'react';
import { Sparkles, ArrowRight, FileText, Users, Headphones, Zap, Share2 } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

const TEMPLATES = [
  { id: 'invoice', title: 'Invoice Processing', icon: FileText, desc: 'Extract data from PDFs & sync to Xero.' },
  { id: 'onboarding', title: 'Employee Onboarding', icon: Users, desc: 'Provision accounts & send welcome emails.' },
  { id: 'support', title: 'Support Triage', icon: Headphones, desc: 'Classify tickets & route to agents.' },
  { id: 'leads', title: 'Lead Routing', icon: Zap, desc: 'Qualify leads & assign to sales reps.' },
  { id: 'social', title: 'Social Monitoring', icon: Share2, desc: 'Track brand mentions & auto-reply.' },
];

export const OnboardingStart: React.FC<{ onStart: () => void }> = ({ onStart }) => {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-gray-50/50 p-8 overflow-y-auto">
      <div className="text-center max-w-3xl w-full">
        
        {/* Main Card */}
        <div className="bg-white p-10 rounded-2xl shadow-xl border border-gray-100 mb-8">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="text-[#E43632] w-8 h-8" />
          </div>
          
          <h1 className="text-3xl font-bold text-[#0A0A0A] mb-3">Let’s build your new workflow.</h1>
          <p className="text-gray-500 text-lg mb-8 max-w-md mx-auto">
            Describe your process to our AI Copilot, or start with a pre-built template below.
          </p>
          
          <Button 
            onClick={onStart}
            className="w-full max-w-md h-14 text-lg font-bold bg-[#0A0A0A] hover:bg-gray-800 text-white rounded-full shadow-lg transition-all hover:scale-[1.02]"
          >
            Start from Scratch <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>

        {/* Templates Grid */}
        <div className="text-left">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 text-center">Or start with a template</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEMPLATES.map((t, i) => (
              <button
                key={t.id}
                onClick={onStart}
                className={cn(
                  "flex flex-col p-5 rounded-xl border border-gray-200 bg-white hover:border-[#E43632] hover:shadow-md transition-all text-left group",
                  // Center the last item if odd number
                  i === 4 ? "lg:col-start-2" : ""
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-gray-50 text-gray-600 flex items-center justify-center mb-3 group-hover:bg-[#E43632] group-hover:text-white transition-colors">
                  <t.icon size={20} />
                </div>
                <h4 className="font-bold text-[#0A0A0A] mb-1">{t.title}</h4>
                <p className="text-xs text-gray-500 leading-relaxed">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
