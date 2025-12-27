import React from "react";
import { Bot, Database, LayoutTemplate, Search, Slack, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const blueprintCards = [
  {
    title: "Lead to Cash",
    desc: "Qualify leads, create deals, send contracts, and issue invoices automatically.",
    tags: ["Salesforce", "Slack", "Stripe"],
  },
  {
    title: "Support Triage",
    desc: "Classify tickets, route to agents, and auto-resolve common requests.",
    tags: ["Zendesk", "Slack", "OpenAI"],
  },
  {
    title: "Employee Onboarding",
    desc: "Provision accounts, ship equipment, and schedule training sessions.",
    tags: ["Okta", "Jira", "Gmail"],
  },
  {
    title: "Invoice Processing",
    desc: "Extract data from PDF invoices, validate details, and sync with Xero/QuickBooks.",
    tags: ["Xero", "QuickBooks", "Email"],
  },
];

export default function WorkflowsPage() {
  return (
    <div className="bg-white">
      <section className="border-b border-gray-100 bg-[#F9FAFB] px-6 pb-20 pt-32">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700">
              <LayoutTemplate className="h-3 w-3" />
              Workflow Library
            </div>
            <h1 className="mb-6 text-5xl font-bold tracking-tight text-[#0A0A0A] md:text-6xl">
              Start with a <span className="text-[#E43632]">Workflow.</span> <br />
              Customize in seconds.
            </h1>
            <p className="mb-8 max-w-2xl text-xl leading-relaxed text-gray-500">
              Browse production-ready automation workflows designed by experts. Launch with a template
              or let Copilot draft one from your description.
            </p>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Search workflows (e.g. 'Invoice', 'Slack')..."
                  className="h-12 bg-white pl-10 text-base"
                />
              </div>
              <Button className="h-12 rounded-full bg-[#0A0A0A] px-6 text-white">
                Search
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
              Workflow of the Month
            </p>
            <h2 className="mt-2 text-4xl font-bold text-[#0A0A0A]">Multi-Stage Deal Provisioning</h2>
            <p className="mt-4 text-lg leading-relaxed text-gray-600">
              Automatically provision resources when a high-value deal closes. Connect your CRM, project
              management, and communication tools to eliminate manual handoffs.
            </p>
            <div className="mt-6 flex items-center gap-4">
              <span className="text-sm font-medium text-gray-900">Connects:</span>
              <div className="flex -space-x-2">
                <div className="z-30 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-[#00A1E0] shadow-sm">
                  <Users className="h-5 w-5" />
                </div>
                <div className="z-20 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-[#E43632] shadow-sm">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="z-10 flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-[#E01E5A] shadow-sm">
                  <Slack className="h-5 w-5" />
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-[#0052CC] shadow-sm">
                  <Database className="h-5 w-5" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {blueprintCards.map((bp) => (
              <Card key={bp.title} className="border-gray-200 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
                <CardHeader>
                  <CardTitle className="text-xl text-[#0A0A0A]">{bp.title}</CardTitle>
                  <CardDescription className="text-gray-500">{bp.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {bp.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="text-sm font-semibold text-[#E43632]">
                  Preview workflow →
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-gray-100 bg-[#0A0A0A] px-6 py-20 text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
              Ready to launch
            </p>
            <h3 className="text-3xl font-bold">Start with a template or describe your own.</h3>
              <p className="max-w-2xl text-gray-300">
                Tell Copilot what you want to automate. We&apos;ll draft the workflow, wire the systems,
                and monitor every run.
              </p>
          </div>
            <Button className="h-12 rounded-full bg-white px-8 font-bold text-[#0A0A0A] hover:bg-gray-100">
              Browse all workflows
            </Button>
        </div>
      </section>
    </div>
  );
}

