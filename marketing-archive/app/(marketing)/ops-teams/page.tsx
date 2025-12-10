import React from "react";
import { Eye, GitPullRequest, LayoutDashboard, Lock, Server, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function OpsTeamsPage() {
  return (
    <div className="bg-[#F9FAFB] pt-24 text-[#0A0A0A]">
      <section className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 px-6 py-20 lg:grid-cols-2">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-700">
            Internal Operations Platform
          </div>
          <h1 className="mb-6 text-4xl font-bold tracking-tight text-[#0A0A0A] md:text-5xl">
            Give your business teams a copilot — <span className="text-[#E43632]">keep control in Ops.</span>
          </h1>
          <p className="mb-8 text-lg leading-relaxed text-gray-500">
            WRK Copilot lets sales, finance, and support teams describe their needs, while Ops retains full
            governance, security, and architectural oversight. Stop being the bottleneck; start being the
            governor.
          </p>
          <Button className="h-12 rounded-full bg-[#0A0A0A] px-8 font-bold text-white shadow-lg transition-colors hover:bg-black">
            See Admin Capabilities
          </Button>
        </div>
        <div className="relative transform rounded-xl border border-gray-200 bg-white p-6 shadow-2xl shadow-gray-200 transition-transform duration-500 hover:rotate-0 rotate-1 group">
          <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-[#E43632]/20 to-blue-500/20 opacity-0 blur transition duration-500 group-hover:opacity-100" />
          <div className="relative h-full rounded-lg bg-white">
            <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-2 text-[#0A0A0A] font-bold">
                <LayoutDashboard size={18} className="text-gray-500" /> WRK Admin Console
              </div>
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-[#E43632]" />
                <div className="h-3 w-3 rounded-full bg-amber-500" />
                <div className="h-3 w-3 rounded-full bg-green-500" />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded border-l-2 border-[#E43632] bg-gray-50 p-3 shadow-sm">
                <div>
                  <div className="text-xs text-gray-500">New Request • Sales</div>
                  <div className="text-sm font-medium text-[#0A0A0A]">Lead Routing Logic Update</div>
                </div>
                <div className="rounded px-2 py-1 text-[10px] font-bold uppercase text-[#E43632] bg-[#E43632]/10">
                  Needs Approval
                </div>
              </div>
              <div className="flex items-center justify-between rounded border-l-2 border-emerald-500 bg-gray-50 p-3 shadow-sm">
                <div>
                  <div className="text-xs text-gray-500">Deployment • Finance</div>
                  <div className="text-sm font-medium text-[#0A0A0A]">Q3 Invoice Processing</div>
                </div>
                <div className="rounded px-2 py-1 text-[10px] font-bold uppercase text-emerald-600 bg-emerald-500/10">
                  Live v2.1
                </div>
              </div>
              <div className="flex items-center justify-between rounded border-l-2 border-blue-500 bg-gray-50 p-3 shadow-sm">
                <div>
                  <div className="text-xs text-gray-500">Audit • System</div>
                  <div className="text-sm font-medium text-[#0A0A0A]">API Key Rotation</div>
                </div>
                <div className="text-xs text-gray-400">2m ago</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-gray-200 bg-white py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <h2 className="text-3xl font-bold text-[#0A0A0A]">Enterprise-Grade Governance</h2>
            <p className="mt-4 text-gray-500">Designed for teams that need to scale automation without creating shadow IT.</p>
          </div>

          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                icon: Eye,
                title: "Centralized Visibility",
                desc: "See every automation request, active workflow, and error rate across the entire company in one dashboard.",
              },
              {
                icon: GitPullRequest,
                title: "Change Management",
                desc: "Automations are versioned. Roll back instantly if something breaks. Require explicit approval before production deploys.",
              },
              {
                icon: Lock,
                title: "Role-Based Access",
                desc: "Define who can request, who can approve, and who can view sensitive data. Granular permissions per workspace.",
              },
            ].map((item) => (
              <Card key={item.title} className="border-none bg-transparent shadow-none group">
                <CardContent className="p-0">
                  <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 text-gray-700 shadow-sm transition-colors group-hover:bg-[#E43632] group-hover:text-white">
                    <item.icon size={24} />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-[#0A0A0A]">{item.title}</h3>
                  <p className="leading-relaxed text-gray-500">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="relative overflow-hidden rounded-2xl border border-gray-800 bg-[#0A0A0A] p-8 text-white shadow-2xl">
          <div className="absolute right-0 top-0 p-12 opacity-5">
            <Server size={200} />
          </div>
          <div className="relative z-10 max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#E43632]">
              <Shield size={14} /> Security First architecture
            </div>
            <h2 className="mb-6 text-3xl font-bold">Your data stays yours.</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {[
                { title: "Tenant Isolation", desc: "Strict logical separation of data and execution environments." },
                { title: "SOC 2 Type II", desc: "Audited controls for security, availability, and confidentiality." },
                { title: "Encryption", desc: "AES-256 at rest and TLS 1.3 in transit for all data." },
                { title: "Private Link", desc: "Optional direct connectivity to your VPC for sensitive workloads." },
              ].map((item) => (
                <div key={item.title} className="flex gap-3">
                  <div className="h-full w-1 bg-[#E43632]" />
                  <div>
                    <h4 className="text-sm font-bold">{item.title}</h4>
                    <p className="text-xs text-gray-400">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

