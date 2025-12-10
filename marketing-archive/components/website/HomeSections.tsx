import Link from "next/link";
import React from "react";
import {
  ArrowRight,
  BarChart,
  Check,
  CheckCircle2,
  Database,
  FileText,
  Globe,
  MessageSquare,
  Play,
  ShieldCheck,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../ui/accordion";
import { ImageWithFallback } from "../figma/ImageWithFallback";

// --- SECTION 2: HOW IT WORKS ---
export const HowItWorks = () => {
  const steps = [
    {
      id: 1,
      icon: MessageSquare,
      title: "Describe",
      desc: "Chat with CoPilot to define your process in plain English.",
      color: "bg-blue-50 text-blue-600"
    },
    {
      id: 2,
      icon: Workflow,
      title: "Blueprint",
      desc: "AI instantly architects a visual workflow with logic & integration.",
      color: "bg-purple-50 text-purple-600"
    },
    {
      id: 3,
      icon: Users,
      title: "Build & Monitor",
      desc: "Wrk engineers finalize the build. Humans monitor 24/7.",
      color: "bg-amber-50 text-amber-600"
    },
    {
      id: 4,
      icon: CheckCircle2,
      title: "Pay per Outcome",
      desc: "No hourly rates. Pay only for successfully completed tasks.",
      color: "bg-emerald-50 text-emerald-600"
    },
  ];

  return (
    <section className="py-24 bg-white border-y border-gray-100">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-[#0A0A0A] mb-4">From vague idea to live automation.</h2>
          <p className="text-lg text-gray-500">CoPilot turns your process into a blueprint, then Wrk builds and runs it.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
           {/* Connector Line */}
           <div className="hidden md:block absolute top-12 left-12 right-12 h-0.5 bg-gray-100 -z-10" />

           {steps.map((step) => (
              <div key={step.id} className="relative flex flex-col items-center text-center group">
                 <div className={cn(
                    "w-24 h-24 rounded-2xl flex items-center justify-center mb-6 border-4 border-white shadow-sm transition-transform group-hover:scale-105",
                    step.color
                 )}>
                    <step.icon size={32} />
                 </div>
                 <h3 className="text-lg font-bold text-[#0A0A0A] mb-2">{step.title}</h3>
                 <p className="text-sm text-gray-500 leading-relaxed max-w-[240px]">{step.desc}</p>
              </div>
           ))}
        </div>
      </div>
    </section>
  );
};

// --- SECTION 3: BLUEPRINT GALLERY ---
export const BlueprintGallery = () => {
   const blueprints = [
     { 
        title: "Lead to Cash", 
        desc: "Qualify leads, create deals, send contracts, and issue invoices automatically.", 
        icon: Zap,
        image: "https://images.unsplash.com/photo-1578070581071-d9b52bf80993"
     },
     { 
        title: "Support Triage", 
        desc: "Classify tickets, route to agents, and auto-resolve common requests.", 
        icon: MessageSquare,
        image: "https://images.unsplash.com/photo-1725798451557-fc60db3eb6a2"
     },
     { 
        title: "Employee Onboarding", 
        desc: "Provision accounts, send equipment, and schedule training sessions.", 
        icon: Users,
        image: "https://images.unsplash.com/photo-1762330463032-06f873b3277c"
     },
     { 
        title: "Invoice Processing", 
        desc: "Extract data from PDF invoices, validate details, and sync with Xero/Quickbooks.", 
        icon: FileText,
        image: "https://images.unsplash.com/photo-1762427354397-854a52e0ded7"
     },
     { 
        title: "Data Entry & Enrichment", 
        desc: "Scrape data from web sources, enrich CRM records, and keep databases in sync.", 
        icon: Database,
        image: "https://images.unsplash.com/photo-1744782211816-c5224434614f"
     },
     { 
        title: "Report Generation", 
        desc: "Aggregate metrics from multiple tools and send daily executive summaries.", 
        icon: BarChart,
        image: "https://images.unsplash.com/photo-1666148670142-2f01b117e6e0"
     },
   ];

   return (
     <section className="py-24 bg-[#F9FAFB]">
       <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between mb-12">
             <div>
                <h2 className="text-3xl font-bold text-[#0A0A0A] mb-2">Blueprints for real-world operations.</h2>
                <p className="text-gray-500">Start with a template or build from scratch.</p>
             </div>
             <Button variant="outline" className="hidden md:flex rounded-full border-gray-300">View all blueprints</Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
             {blueprints.map((bp, i) => (
               <div key={i} className="bg-white rounded-2xl p-2 border border-gray-200 shadow-sm hover:shadow-md transition-all group cursor-pointer">
                  {/* Real Image Preview */}
                  <div className="bg-gray-900 rounded-xl aspect-video w-full mb-4 relative overflow-hidden border border-gray-100">
                     <ImageWithFallback
                        src={bp.image}
                        alt={bp.title}
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                     />
                     
                     {/* Icon Badge */}
                     <div className="absolute bottom-4 left-4 w-10 h-10 bg-white rounded-lg shadow-sm flex items-center justify-center z-10">
                        <bp.icon size={18} className="text-[#0A0A0A]" />
                     </div>
                     
                     {/* Hover Overlay */}
                     <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20">
                        <span className="bg-white text-[#0A0A0A] px-4 py-2 rounded-full text-xs font-bold shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform">Preview Blueprint</span>
                     </div>
                  </div>

                  <div className="px-4 pb-4">
                     <h3 className="font-bold text-[#0A0A0A] mb-1">{bp.title}</h3>
                     <p className="text-sm text-gray-500 leading-relaxed">{bp.desc}</p>
                  </div>
               </div>
             ))}
          </div>
       </div>
     </section>
   );
};

// --- SECTION 4: PRICING ---
export const PricingOverview = () => {
   return (
     <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
           <div className="text-center max-w-3xl mx-auto mb-16">
             <h2 className="text-3xl md:text-4xl font-bold text-[#0A0A0A] mb-4">Simple, outcome-based pricing.</h2>
             <p className="text-lg text-gray-500">A refundable setup fee, then pay per successfully completed task.</p>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Starter */}
              <div className="rounded-3xl p-8 border border-gray-200 hover:border-gray-300 transition-colors">
                 <h3 className="text-xl font-bold mb-2">Starter</h3>
                 <p className="text-sm text-gray-500 mb-6 h-10">For teams piloting their first automation.</p>
                 <div className="text-3xl font-bold mb-1">$500 <span className="text-sm font-normal text-gray-500">/ setup</span></div>
                 <div className="text-sm text-emerald-600 font-medium mb-8">+ Pay per task</div>
                 <Button variant="outline" className="w-full rounded-full mb-8">Get Started</Button>
                 <ul className="space-y-3 text-sm text-gray-600">
                    <li className="flex gap-2"><Check size={16} className="text-emerald-500" /> 1 Workflow</li>
                    <li className="flex gap-2"><Check size={16} className="text-emerald-500" /> Standard Turnaround</li>
                    <li className="flex gap-2"><Check size={16} className="text-emerald-500" /> Email Support</li>
                 </ul>
              </div>

              {/* Growth */}
              <div className="rounded-3xl p-8 border-2 border-[#0A0A0A] bg-[#0A0A0A] text-white relative shadow-xl transform md:-translate-y-4">
                 <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#E43632] text-white px-3 py-1 rounded-full text-xs font-bold">MOST POPULAR</div>
                 <h3 className="text-xl font-bold mb-2">Growth</h3>
                 <p className="text-sm text-gray-400 mb-6 h-10">For scaling operations with multiple processes.</p>
                 <div className="text-3xl font-bold mb-1">$2,000 <span className="text-sm font-normal text-gray-400">/ setup</span></div>
                 <div className="text-sm text-emerald-400 font-medium mb-8">+ Pay per task</div>
                 <Button className="w-full rounded-full bg-white text-black hover:bg-gray-100 mb-8 font-bold">Start Building</Button>
                 <ul className="space-y-3 text-sm text-gray-300">
                    <li className="flex gap-2"><Check size={16} className="text-emerald-400" /> Up to 5 Workflows</li>
                    <li className="flex gap-2"><Check size={16} className="text-emerald-400" /> Priority Build Queue</li>
                    <li className="flex gap-2"><Check size={16} className="text-emerald-400" /> Slack Connect Channel</li>
                 </ul>
              </div>

              {/* Enterprise */}
              <div className="rounded-3xl p-8 border border-gray-200 hover:border-gray-300 transition-colors">
                 <h3 className="text-xl font-bold mb-2">Enterprise</h3>
                 <p className="text-sm text-gray-500 mb-6 h-10">Full-service operations partnership.</p>
                 <div className="text-3xl font-bold mb-1">Custom</div>
                 <div className="text-sm text-gray-500 font-medium mb-8">Volume discounts available</div>
                 <Button variant="outline" className="w-full rounded-full mb-8">Contact Sales</Button>
                 <ul className="space-y-3 text-sm text-gray-600">
                    <li className="flex gap-2"><Check size={16} className="text-emerald-500" /> Unlimited Workflows</li>
                    <li className="flex gap-2"><Check size={16} className="text-emerald-500" /> 24/7 Monitoring</li>
                    <li className="flex gap-2"><Check size={16} className="text-emerald-500" /> Dedicated Ops Manager</li>
                 </ul>
              </div>
           </div>

           <div className="mt-12 bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center max-w-2xl mx-auto flex items-center justify-center gap-3">
              <ShieldCheck className="text-emerald-600" size={20} />
              <p className="text-emerald-800 font-medium text-sm">
                 Guarantee: Your setup fee is fully refundable if we don't get your workflow live.
              </p>
           </div>
        </div>
     </section>
   );
};

// --- SECTION 5: COMPARISON ---
export const ComparisonBlock = () => {
   return (
     <section className="py-24 bg-[#F9FAFB]">
        <div className="max-w-6xl mx-auto px-6">
           <div className="grid grid-cols-1 md:grid-cols-2 rounded-3xl overflow-hidden shadow-sm border border-gray-200">
              
              {/* DIY Side */}
              <div className="bg-white p-12 border-r border-gray-100">
                 <h3 className="text-2xl font-bold text-gray-400 mb-8">DIY Tools (Zapier, Make)</h3>
                 <ul className="space-y-6">
                    <li className="flex gap-4 items-start opacity-60">
                       <X size={24} className="text-red-400 shrink-0 mt-1" />
                       <div>
                          <p className="font-semibold text-gray-800">You build it yourself</p>
                          <p className="text-sm text-gray-500 mt-1">Requires learning curve and technical skills.</p>
                       </div>
                    </li>
                    <li className="flex gap-4 items-start opacity-60">
                       <X size={24} className="text-red-400 shrink-0 mt-1" />
                       <div>
                          <p className="font-semibold text-gray-800">You fix the bugs</p>
                          <p className="text-sm text-gray-500 mt-1">When APIs break, your business stops.</p>
                       </div>
                    </li>
                    <li className="flex gap-4 items-start opacity-60">
                       <X size={24} className="text-red-400 shrink-0 mt-1" />
                       <div>
                          <p className="font-semibold text-gray-800">Pay for every run</p>
                          <p className="text-sm text-gray-500 mt-1">Even if the automation fails or errors out.</p>
                       </div>
                    </li>
                 </ul>
              </div>

              {/* Wrk Side */}
              <div className="bg-white p-12 relative overflow-hidden">
                 <div className="absolute inset-0 bg-blue-50/30" />
                 <div className="relative z-10">
                    <h3 className="text-2xl font-bold text-[#0A0A0A] mb-8 flex items-center gap-3">
                       Wrk CoPilot <span className="text-xs bg-[#E43632] text-white px-2 py-0.5 rounded uppercase tracking-wider">Better</span>
                    </h3>
                    <ul className="space-y-6">
                       <li className="flex gap-4 items-start">
                          <CheckCircle2 size={24} className="text-emerald-500 shrink-0 mt-1" />
                          <div>
                             <p className="font-semibold text-[#0A0A0A]">You just describe it</p>
                             <p className="text-sm text-gray-600 mt-1">AI drafts the plan, our engineers build it.</p>
                          </div>
                       </li>
                       <li className="flex gap-4 items-start">
                          <CheckCircle2 size={24} className="text-emerald-500 shrink-0 mt-1" />
                          <div>
                             <p className="font-semibold text-[#0A0A0A]">Humans monitor 24/7</p>
                             <p className="text-sm text-gray-600 mt-1">We fix edge cases before you even notice.</p>
                          </div>
                       </li>
                       <li className="flex gap-4 items-start">
                          <CheckCircle2 size={24} className="text-emerald-500 shrink-0 mt-1" />
                          <div>
                             <p className="font-semibold text-[#0A0A0A]">Pay per successful outcome</p>
                             <p className="text-sm text-gray-600 mt-1">Failed runs are on us. You pay for results.</p>
                          </div>
                       </li>
                    </ul>
                 </div>
              </div>

           </div>
        </div>
     </section>
   );
};

// --- SECTION 6: TRUST & FAQ ---
export const TrustSection = () => {
   const faqs = [
     {
       question: "How is this different from Zapier?",
       answer: "Zapier connects apps, but you have to build and maintain the logic yourself. If an API changes, your Zap breaks. Wrk is a fully managed service: you describe the outcome, we build the automation, and our humans fix any issues that arise during execution."
     },
     {
       question: "What happens if the automation breaks?",
       answer: "Unlike pure software tools, Wrk has a 'human-in-the-loop' layer. If a bot gets stuck or an API fails, a task is instantly routed to our 24/7 operations team who completes it manually while we fix the bot. Your process never stops."
     },
     {
       question: "Do I need to know how to code?",
       answer: "Not at all. You simply chat with CoPilot in plain English to describe your process. We handle all the technical complexity, API authentication, and data mapping."
     },
     {
       question: "Is my data secure?",
       answer: "Yes. We are SOC2 Type II compliant and ISO 27001 certified. All data is encrypted in transit and at rest, and we have strict access controls for our human operations team."
     },
     {
       question: "How does the pricing work exactly?",
       answer: "You pay a one-time setup fee to get your workflow built. After that, you only pay for successful outcomes (e.g., '100 leads enriched'). You don't pay for server time, API calls, or failed runs."
     }
   ];

   return (
     <section className="py-24 bg-white border-t border-gray-100">
        <div className="max-w-4xl mx-auto px-6 text-center mb-20">
           <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-8">Trusted by modern operations teams</p>
           <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-8 opacity-50 grayscale">
              {/* Modern Company Logos (Text Based) */}
              <div className="flex items-center gap-2 text-2xl font-bold text-gray-800 tracking-tighter">
                 <span className="w-6 h-6 bg-gray-800 rounded-full"></span> REVOLUT
              </div>
              <div className="text-2xl font-sans font-black tracking-tight text-gray-800 italic">
                 GUSTO
              </div>
              <div className="text-xl font-mono font-bold text-gray-800 tracking-widest">
                 MONDAY.COM
              </div>
              <div className="flex items-center gap-1 text-2xl font-bold text-gray-800">
                 <div className="flex gap-0.5">
                    <div className="w-2 h-4 bg-gray-800 rounded-full"></div>
                    <div className="w-2 h-6 bg-gray-800 rounded-full"></div>
                    <div className="w-2 h-3 bg-gray-800 rounded-full"></div>
                 </div>
                 Udemy
              </div>
              <div className="text-2xl font-serif font-bold text-gray-800">
                 Notion
              </div>
           </div>
           
           <div className="flex flex-wrap justify-center gap-6 mt-12">
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-4 py-2 rounded-full">
                 <ShieldCheck size={16} className="text-emerald-600" /> Enterprise-ready security
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-4 py-2 rounded-full">
                 <Users size={16} className="text-blue-600" /> Human-in-the-loop monitoring
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-4 py-2 rounded-full">
                 <Globe size={16} className="text-purple-600" /> Global ops team
              </div>
           </div>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto px-6 mb-32">
           <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
           
           <Accordion type="single" collapsible className="w-full space-y-4">
              {faqs.map((faq, i) => (
                <AccordionItem key={i} value={`item-${i}`} className="border border-gray-200 rounded-xl px-6 bg-white hover:bg-gray-50/50 transition-colors data-[state=open]:bg-gray-50/50 data-[state=open]:border-gray-300">
                  <AccordionTrigger className="text-base font-medium text-gray-900 hover:no-underline hover:text-[#E43632] py-6">
                     {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-600 leading-relaxed pb-6">
                     {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
           </Accordion>
        </div>

        {/* FINAL CTA */}
        <div className="relative bg-[#0A0A0A] py-24 overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-br from-[#E43632]/20 to-transparent" />
           <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">Ready to describe your first process?</h2>
              <p className="text-xl text-gray-400 mb-10">Start a blueprint in under 2 minutes. No technical setup required.</p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                 <Button
                   asChild
                   size="lg"
                   className="h-16 rounded-full bg-[#E43632] px-10 text-lg font-bold text-white shadow-[0_0_30px_-5px_rgba(228,54,50,0.5)] hover:bg-[#C12E2A]"
                 >
                    <Link href="/pricing">Start designing my workflow</Link>
                 </Button>
                 <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="h-16 rounded-full border-white/20 bg-transparent px-10 text-lg font-semibold text-white hover:bg-white/10"
                 >
                    <Link href="/contact">Talk to an expert</Link>
                 </Button>
              </div>
           </div>
        </div>
     </section>
   );
};
