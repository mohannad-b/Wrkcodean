import React from "react";
import { ArrowRight, BookOpen, Terminal, Video } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ResourcesPage() {
  const guides = [
    { title: "How to pick your first automation", type: "Guide", readTime: "5 min" },
    { title: "Automation workflows 101", type: "Guide", readTime: "8 min" },
    { title: "Lead routing playbook", type: "Playbook", readTime: "12 min" },
    { title: "Invoice automation checklist", type: "Checklist", readTime: "3 min" },
  ];

  return (
    <div className="min-h-screen bg-[#F9FAFB] pt-24 text-[#0A0A0A]">
      <section className="mx-auto max-w-7xl border-b border-gray-200 px-6 py-16">
        <h1 className="mb-6 text-4xl font-bold text-[#0A0A0A]">Resources</h1>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {["All Resources", "Guides", "Product Docs", "Webinars"].map((tab, idx) => (
            <button
              key={tab}
              className={
                idx === 0
                  ? "whitespace-nowrap rounded-full bg-[#0A0A0A] px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-black transition-colors"
                  : "whitespace-nowrap rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
              }
            >
              {tab}
            </button>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          <div className="grid grid-cols-1 gap-6 lg:col-span-2 md:grid-cols-2">
            {guides.map((g, i) => (
              <Card
                key={i}
                className="group cursor-pointer border-gray-200 bg-white shadow-sm transition-all hover:border-[#E43632] hover:shadow-lg"
              >
                <CardHeader>
                  <div className="mb-4 flex items-center justify-between">
                    <Badge variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-200">
                      {g.type}
                    </Badge>
                    <span className="text-xs text-gray-500">{g.readTime}</span>
                  </div>
                  <CardTitle className="text-[#0A0A0A] transition-colors group-hover:text-[#E43632]">
                    {g.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm leading-relaxed text-gray-500">
                    Learn the best practices for implementing this workflow in your organization using
                    WRK Copilot.
                  </p>
                  <div className="flex items-center text-sm font-bold text-[#0A0A0A] transition-colors group-hover:text-[#E43632]">
                    Read Now <ArrowRight size={14} className="ml-2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-8">
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 font-bold text-[#0A0A0A]">Quick Links</h3>
              <ul className="space-y-3">
                {[
                  { icon: BookOpen, label: "Documentation" },
                  { icon: Terminal, label: "API Reference" },
                  { icon: Video, label: "Video Tutorials" },
                ].map((item) => (
                  <li key={item.label}>
                    <button className="flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-[#E43632]">
                      <item.icon size={16} /> {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 p-6 text-[#0A0A0A] shadow-md">
              <h3 className="mb-2 font-bold">Need expert help?</h3>
              <p className="mb-6 text-sm text-gray-500">
                Our solution architects can help you design your first complex workflow.
              </p>
              <button className="w-full rounded-lg bg-[#E43632] py-3 text-sm font-bold text-white shadow-lg shadow-red-500/20 transition-colors hover:bg-[#C12E2A]">
                Talk to an Expert
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

