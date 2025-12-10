import Link from "next/link";
import React from "react";
import { ArrowRight, CheckCircle, FileText, Headphones, Home as HomeIcon, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function UseCasesPage() {
  const cases = [
    {
      id: "sales",
      icon: Users,
      title: "Lead Routing & Enrichment",
      desc: "Qualify leads instantly, enrich with Clearbit/Apollo, and route to the right rep based on territory.",
      benefits: ["Reduce response time to < 5 mins", "Eliminate manual CRM entry", "Fair territory distribution"],
      color: "text-blue-600 bg-blue-50 border-blue-100",
    },
    {
      id: "finance",
      icon: FileText,
      title: "Invoice Processing (AP)",
      desc: "Extract data from PDF invoices, match against POs, and create draft bills in Xero/NetSuite.",
      benefits: ["99% data extraction accuracy", "Auto-flag anomalies > $5k", "Sync to ERP instantly"],
      color: "text-amber-600 bg-amber-50 border-amber-100",
    },
    {
      id: "prop",
      icon: HomeIcon,
      title: "Property Management",
      desc: "Handle tenant maintenance requests, dispatch vendors, and update tracking systems automatically.",
      benefits: ["24/7 request triage", "Auto-dispatch preferred vendors", "Keep tenants updated via SMS"],
      color: "text-green-600 bg-green-50 border-green-100",
    },
    {
      id: "support",
      icon: Headphones,
      title: "Support Triage",
      desc: "Classify incoming tickets, auto-resolve common queries, and escalate critical issues to Slack.",
      benefits: ["Deflect 30% of Tier 1 tickets", "Detect sentiment/urgency", "Route by expertise"],
      color: "text-purple-600 bg-purple-50 border-purple-100",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F9FAFB] pt-24 text-[#0A0A0A]">
      <section className="relative mx-auto max-w-7xl px-6 py-20 text-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[250px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#E43632] opacity-[0.05] blur-[100px]" />
        <h1 className="mb-6 text-4xl font-bold tracking-tight text-[#0A0A0A] md:text-5xl">
          Automate the work that <span className="text-[#E43632]">slows you down.</span>
        </h1>
        <p className="mx-auto max-w-2xl text-xl leading-relaxed text-gray-500">
          Start with one critical workflow. Expand as you see the ROI. WRK Copilot handles processes
          across every department.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {cases.map((c) => (
            <Card
              key={c.id}
              className="group cursor-pointer border-gray-200 bg-white shadow-sm transition-all hover:border-[#E43632]/50 hover:shadow-lg"
            >
              <CardHeader>
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg border ${c.color}`}>
                  <c.icon size={24} />
                </div>
                <CardTitle className="text-2xl font-bold text-[#0A0A0A]">{c.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-6 min-h-[3rem] leading-relaxed text-gray-500">{c.desc}</p>
                <div className="mb-8 space-y-3">
                  {c.benefits.map((b, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm font-medium text-gray-600">
                      <CheckCircle size={16} className="shrink-0 text-emerald-600" />
                      {b}
                    </div>
                  ))}
                </div>
                <div className="flex items-center text-sm font-bold text-[#E43632] transition-transform duration-150 group-hover:translate-x-1">
                  See Workflow <ArrowRight size={16} className="ml-2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-gray-200 bg-white py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="mb-4 text-3xl font-bold text-[#0A0A0A]">Don't see your use case?</h2>
          <p className="mb-8 text-lg text-gray-500">
            If it involves moving data between systems, following logic rules, or processing
            documents, WRK Copilot can likely build it.
          </p>
          <Button
            asChild
            className="h-14 rounded-full bg-[#0A0A0A] px-8 font-bold text-white shadow-lg transition-colors hover:bg-black"
          >
            <Link href="/pricing">Describe your unique process</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

