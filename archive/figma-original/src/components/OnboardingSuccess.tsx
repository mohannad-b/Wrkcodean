import React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

export const OnboardingSuccess: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  React.useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-white text-center p-8">
      <div
        className="animate-in fade-in zoom-in-95 duration-500"
      >
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-8">
          <CheckCircle2 className="w-12 h-12 text-green-600" />
        </div>
        
        <h2 className="text-3xl font-bold text-[#0A0A0A] mb-4">Payment Successful!</h2>
        <p className="text-gray-500 text-lg max-w-md mx-auto mb-8">
          Your build has been initiated. Our team is now working on your automation.
        </p>

        <div className="flex items-center justify-center gap-2 text-sm text-gray-400 font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-[#E43632]" />
          Redirecting to Build Progress...
        </div>
      </div>
    </div>
  );
};
