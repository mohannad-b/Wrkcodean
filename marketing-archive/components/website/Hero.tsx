import React from 'react';
import { Play } from 'lucide-react';
import { Button } from '../ui/button';
import { HeroAnimation } from './HeroAnimation';

interface HeroProps {
  onNavigate: (page: string) => void;
}

export const Hero: React.FC<HeroProps> = ({ onNavigate }) => {
  return (
    <section className="relative min-h-screen flex items-center pt-32 pb-20 md:pt-40 md:pb-24 px-6 bg-[#0A0A0A] overflow-hidden">
      
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
         <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-[#E43632] opacity-[0.08] blur-[150px] rounded-full mix-blend-screen" />
         <div className="absolute bottom-[-20%] right-[-10%] w-[800px] h-[800px] bg-blue-600 opacity-[0.06] blur-[150px] rounded-full mix-blend-screen" />
         <div className="absolute top-[40%] left-[30%] w-[500px] h-[500px] bg-purple-500 opacity-[0.04] blur-[150px] rounded-full mix-blend-screen" />
      </div>

      <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center w-full relative z-10">
        
        {/* LEFT: Copy & CTAs */}
        <div className="space-y-8 max-w-2xl">
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] text-white">
            Describe your process. <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E43632] to-[#FF8A80]">Wrk CoPilot builds it.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-gray-400 leading-relaxed max-w-xl font-light">
            Chat with an AI copilot that turns your process into a blueprint, then builds, tests, and launches your automation for you.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <Button 
              size="lg" 
              onClick={() => onNavigate('app')}
              className="bg-[#E43632] hover:bg-[#C12E2A] text-white font-semibold h-14 px-8 rounded-full shadow-lg shadow-red-500/30 hover:shadow-red-500/40 transition-all duration-300 text-base"
            >
              Try Wrk CoPilot
            </Button>
            <Button 
              variant="outline" 
              size="lg" 
              className="h-14 px-8 rounded-full font-semibold text-white border-white/10 hover:bg-white/10 bg-white/5 backdrop-blur-sm shadow-sm text-base"
            >
              <Play size={16} className="mr-2 fill-current" /> Watch it build live
            </Button>
          </div>

          {/* Trust Signals */}
          <div className="pt-6 flex items-center gap-4 border-t border-white/10 w-fit pr-8">
             <div className="flex -space-x-3">
                {[1,2,3,4].map(i => (
                   <div key={i} className="w-9 h-9 rounded-full border-2 border-[#0A0A0A] bg-gray-800 overflow-hidden ring-2 ring-white/5">
                      <img src={`https://i.pravatar.cc/100?img=${i + 10}`} alt="User" className="w-full h-full object-cover opacity-90" />
                   </div>
                ))}
             </div>
             <div className="text-sm text-gray-400 font-medium">
                Trusted by operations leaders <br/> at top companies
             </div>
          </div>
        </div>

        {/* RIGHT: Animated Product Story */}
        <div className="relative w-full flex justify-center lg:justify-end">
           <div className="relative w-full">
              {/* Glow Effect behind animation */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-r from-blue-500/20 to-purple-500/20 blur-3xl rounded-full opacity-50" />
              <HeroAnimation />
           </div>
        </div>

      </div>
    </section>
  );
};
