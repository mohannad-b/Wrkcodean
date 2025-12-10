'use client';

import Link from "next/link";
import React, { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  GitBranch,
  Layout,
  MessageSquare,
  Shield,
  Terminal,
  Users,
  Zap,
} from "lucide-react";

import { ActivityTab } from "@/components/marketing/ActivityTab";
import { BuildStatusTab } from "@/components/marketing/BuildStatusTab";
import { HeroStudioChat } from "@/components/website/HeroStudioChat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const chatMessages = [
  {
    id: "0",
    role: "user" as const,
    content: "I want to automate my invoice approval process",
    timestamp: "10:00 AM",
  },
  {
    id: "1",
    role: "ai" as const,
    content:
      "I drafted an invoice automation workflow with extraction, approvals, and posting to Xero. Want me to show it on the canvas?",
    timestamp: "10:01 AM",
    suggestions: ["Add approval step", "Refine trigger", "Show in canvas"],
  },
];

const featurePillars = [
  {
    title: "CoPilot & Workflow Design",
    icon: MessageSquare,
    description:
      "Describe your process in plain language. WRK Copilot drafts the visual workflow with logic, systems, and SLAs.",
    accent: "text-blue-600 bg-blue-50 border-blue-100",
  },
  {
    title: "Build, Test & Launch",
    icon: GitBranch,
    description:
      "Our team implements your workflow, connects systems, and runs test cycles until it is ready for production.",
    accent: "text-purple-600 bg-purple-50 border-purple-100",
  },
  {
    title: "Monitoring & Outcomes",
    icon: Shield,
    description:
      "Humans watch every run, handle exceptions, and iterate on edge cases. You pay only for successful outcomes.",
    accent: "text-emerald-700 bg-emerald-50 border-emerald-100",
  },
];

export default function ProductPage() {
  const [activePreview, setActivePreview] = useState<"workflow" | "build" | "activity">(
    "workflow"
  );

  return (
    <div className="bg-white text-[#0A0A0A]">
      <section className="relative overflow-hidden bg-[#F9FAFB] px-6 pb-24 pt-32">
        <div className="mx-auto max-w-7xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-700">
            Product Overview
          </div>
          <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-6xl">
            A full stack for <br />
            <span className="bg-gradient-to-r from-[#E43632] to-[#FF5F57] bg-clip-text text-transparent">
              describe-to-done automation.
            </span>
          </h1>
          <p className="mx-auto max-w-3xl text-xl leading-relaxed text-gray-500">
            WRK Copilot combines an AI workflow designer, a collaborative automation studio, and a
            human-ops team that builds and monitors your workflows — all priced per successful task.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
            <Button asChild size="lg" className="h-12 rounded-full bg-[#0A0A0A] px-8 text-white">
              <Link href="/pricing">
                Start designing my workflow <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 rounded-full border-gray-300 px-8"
            >
              <Link href="/trust">See security controls</Link>
            </Button>
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-6xl overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex flex-col gap-4 border-b border-gray-100 bg-gray-50/80 px-4 py-4 md:flex-row md:items-center md:gap-6">
            <div className="flex gap-2">
              <div className="h-3 w-3 rounded-full bg-red-400/80" />
              <div className="h-3 w-3 rounded-full bg-amber-400/80" />
              <div className="h-3 w-3 rounded-full bg-green-400/80" />
            </div>
          <div className="flex flex-wrap items-center gap-3">
            {(["workflow", "build", "activity"] as const).map((tab) => (
                <Button
                  key={tab}
                  variant={activePreview === tab ? "secondary" : "ghost"}
                  size="sm"
                  className={
                    activePreview === tab
                      ? "bg-white shadow-sm"
                      : "text-gray-600 hover:text-[#0A0A0A]"
                  }
                  onClick={() => setActivePreview(tab)}
                >
                  {tab === "workflow" && "Workflow"}
                  {tab === "build" && "Build Status"}
                  {tab === "activity" && "Activity"}
                </Button>
              ))}
            </div>
            <div className="ml-auto hidden items-center gap-2 text-xs font-semibold text-gray-500 md:flex">
              <Badge className="gap-1 bg-[#E43632] text-white hover:bg-[#E43632]">
                <Zap size={12} /> AI Designs
              </Badge>
              <ArrowRight size={12} className="text-gray-300" />
              <Badge className="gap-1 bg-white text-[#0A0A0A] ring-1 ring-gray-200 hover:bg-white">
                <Terminal size={12} /> WRK Builds
              </Badge>
              <ArrowRight size={12} className="text-gray-300" />
              <Badge className="gap-1 bg-amber-50 text-amber-700 ring-1 ring-amber-100 hover:bg-amber-50">
                <Users size={12} /> Humans Monitor
              </Badge>
            </div>
          </div>

          <div className="min-h-[500px] bg-gray-50">
            {activePreview === "workflow" && (
              <div className="grid grid-cols-1 gap-0 md:grid-cols-[360px,1fr]">
                <div className="border-r border-gray-200 bg-white">
                  <HeroStudioChat messages={chatMessages} isThinking={false} step={3} />
                </div>
                <div className="hidden items-center justify-center bg-[#F9FAFB] p-8 text-sm text-gray-500 md:flex">
                  Visual canvas preview available in the full Studio experience.
                </div>
              </div>
            )}
            {activePreview === "build" && (
              <div className="px-4 py-6 md:scale-95 md:transform md:origin-top">
                <BuildStatusTab />
              </div>
            )}
            {activePreview === "activity" && (
              <div className="px-4 py-6 md:scale-95 md:transform md:origin-top">
                <ActivityTab />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border-b border-gray-100 bg-white px-6 py-16">
        <div className="mx-auto max-w-7xl text-center">
          <p className="mb-8 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Trusted by modern operations teams
          </p>
          <div className="mx-auto max-w-4xl text-gray-500">
            <div className="grid grid-cols-2 gap-6 text-sm font-semibold uppercase tracking-wide md:grid-cols-5 md:text-base">
              <span className="opacity-70">Revolut</span>
              <span className="opacity-70">Gusto</span>
              <span className="opacity-70">Monday.com</span>
              <span className="opacity-70">Udemy</span>
              <span className="opacity-70">Notion</span>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-16 max-w-3xl text-center">
            <h2 className="mb-4 text-3xl font-bold text-[#0A0A0A]">
              Three engines under one hood.
            </h2>
            <p className="text-gray-500">
              Most platforms give you tools and wish you luck. We provide the intelligence, the
              labor, and the guarantee.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
            {featurePillars.map((pillar) => (
              <Card key={pillar.title} className="border-gray-100 shadow-sm">
                <CardContent className="space-y-4 p-6">
                  <div
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${pillar.accent}`}
                  >
                    <pillar.icon size={16} /> {pillar.title}
                  </div>
                  <p className="text-sm leading-relaxed text-gray-600">{pillar.description}</p>
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#E43632]">
                    Outcome-backed <ArrowRight size={14} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#F9FAFB] px-6 py-24">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 lg:grid-cols-2">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-700">
              <Shield size={14} /> Reliability baked in
            </div>
            <h3 className="mb-6 text-3xl font-bold text-[#0A0A0A]">
              Human-in-the-loop monitoring for every run.
            </h3>
            <p className="mb-8 text-lg text-gray-500">
              Automations don&apos;t break in a vacuum. Our ops team watches every run, patches edge
              cases in real time, and guarantees delivery.
            </p>
            <ul className="space-y-4">
              {[
                {
                  title: "Exception routing",
                  desc: "If a bot gets stuck, it is instantly routed to a human operator with the right context to finish the task.",
                },
                {
                  title: "Audit-ready logging",
                  desc: "Every step is logged with timestamps, inputs, and outputs so you have the same visibility we do.",
                },
                {
                  title: "Outcome-based pricing",
                  desc: "You pay for successful outcomes, not API calls. Failed runs are on us.",
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-3">
                  <div className="mt-1 text-emerald-500">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <p className="font-semibold text-[#0A0A0A]">{item.title}</p>
                    <p className="text-sm text-gray-500">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <Card className="border-gray-100 bg-white shadow-lg">
            <CardContent className="space-y-4 p-8">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-600">
                <AlertCircle size={16} /> Example: handling an exception
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-700">
                <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-gray-500">
                  <span>Invoice processing run</span>
                  <Badge className="bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                    Exception caught
                  </Badge>
                </div>
                <p>
                  Amount exceeds approval threshold. Human operator notified in Slack, task paused
                  until approval is received.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-gray-100 bg-white p-3 text-xs">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Zap size={12} /> Automated path
                  </div>
                  <p className="mt-2 font-semibold text-[#0A0A0A]">Retry with updated rule set</p>
                </div>
                <div className="rounded-lg border border-gray-100 bg-white p-3 text-xs">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Users size={12} /> Human path
                  </div>
                  <p className="mt-2 font-semibold text-[#0A0A0A]">Ops reviews and marks complete</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

