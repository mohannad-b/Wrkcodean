import Link from "next/link";
import React from "react";
import { ArrowRight, PlayCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { HeroProductFrame } from "./HeroProductFrame";

export const NewHero: React.FC = () => {
  return (
    <section className="relative overflow-hidden bg-[#F9FAFB] pt-32 pb-20">
      
      {/* Background Elements */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent opacity-50" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#E5E7EB_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.3]" />
      
      <div className="relative z-10 mx-auto max-w-7xl px-6">
         
         {/* Text Content */}
         <div className="mx-auto mb-16 max-w-4xl text-center">
            
            {/* Badge */}
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-700">
               <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E43632] opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#E43632]"></span>
               </span>
               <span className="text-xs font-semibold uppercase tracking-wide text-gray-600">New · AI CoPilot for Automation</span>
            </div>

            {/* Headline */}
            <h1 className="mb-6 text-4xl font-bold leading-[1.1] tracking-tight text-[#0A0A0A] animate-in fade-in slide-in-from-bottom-6 duration-700 delay-100 md:text-6xl lg:text-7xl">
               <span className="block whitespace-nowrap md:inline">You describe it. <span className="text-[#E43632]">AI builds it.</span></span> <br className="hidden md:block"/> Humans monitor it.
            </h1>

            {/* Subheadline */}
            <p className="mx-auto mb-10 max-w-2xl text-xl leading-relaxed text-gray-500 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-200">
               WrkCoPilot turns plain-language processes into a detailed automation blueprint. AI designs the system, Wrk engineers implement and monitor it, and you pay only for successfully completed tasks.
            </p>

            {/* CTAs */}
            <div className="flex flex-col items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-300 sm:flex-row">
               <Button
                 asChild
                 size="lg"
                 className="h-14 rounded-full bg-[#0A0A0A] px-8 text-base font-semibold text-white shadow-xl shadow-gray-200 transition-all hover:-translate-y-0.5 hover:bg-black hover:shadow-2xl"
               >
                 <Link href="/pricing">
                   Start designing my workflow
                   <ArrowRight className="ml-2 h-4 w-4" />
                 </Link>
               </Button>
               
               <Button 
                 asChild
                 variant="outline"
                 size="lg"
                 className="h-14 rounded-full border-gray-200 bg-white/50 px-8 text-base font-semibold text-gray-600 backdrop-blur-sm hover:border-gray-300 hover:bg-white hover:text-[#0A0A0A]"
               >
                 <Link href="/resources">
                   <PlayCircle className="mr-2 h-5 w-5 text-gray-400" />
                   Watch 60-second demo
                 </Link>
               </Button>
            </div>
         </div>

         {/* Product Frame */}
         <div className="-mt-8 mx-auto w-[90%] animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-500 md:w-[85%]">
            <HeroProductFrame />
         </div>

      </div>
    </section>
  );
};
