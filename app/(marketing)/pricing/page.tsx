'use client';

import Link from "next/link";
import React, { useState } from "react";
import { Calculator, Check, FileCheck, HelpCircle, Shield, Users, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";

export default function PricingPage() {
  const [volume, setVolume] = useState([1000]);
  const [complexity, setComplexity] = useState([5]);

  const baseRate = 0.5;
  const complexityMultiplier = 1 + complexity[0] * 0.1;
  const volumeDiscount = volume[0] > 5000 ? 0.8 : 1;
  const unitPrice = baseRate * complexityMultiplier * volumeDiscount;
  const total = unitPrice * volume[0];

  return (
    <div className="bg-[#F9FAFB] pt-24 text-[#0A0A0A]">
      <section className="relative mx-auto max-w-7xl px-6 py-20 text-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#E43632] opacity-[0.03] blur-[100px]" />
        <h1 className="mb-6 text-4xl font-bold tracking-tight text-[#0A0A0A] md:text-6xl">
          Simple, outcome-based <span className="text-[#E43632]">pricing.</span>
        </h1>
        <p className="mx-auto max-w-2xl text-xl leading-relaxed text-gray-500">
          A refundable setup fee, then pay per successfully completed task. No hidden monthly
          retainers.
        </p>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-3">
          <Card className="bg-white shadow-sm transition-all border-gray-200 hover:border-gray-300">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-[#0A0A0A]">Starter</CardTitle>
              <CardDescription className="h-10">
                For teams piloting their first automation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#0A0A0A]">$1,000</span>
                  <span className="font-medium text-gray-500">/ setup</span>
                </div>
                <div className="mt-2 text-sm font-medium text-emerald-600">+ Pay per task</div>
              </div>

              <Button
                asChild
                variant="outline"
                className="mb-8 w-full rounded-full font-bold"
              >
                <Link href="/">Get Started</Link>
              </Button>

              <ul className="space-y-3 text-sm text-gray-600">
                <li className="flex gap-2">
                  <Check size={16} className="text-emerald-500" /> 1 Workflow
                </li>
                <li className="flex gap-2">
                  <Check size={16} className="text-emerald-500" /> Standard Turnaround
                </li>
                <li className="flex gap-2">
                  <Check size={16} className="text-emerald-500" /> Email Support
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="relative transform bg-[#0A0A0A] text-white shadow-xl md:-translate-y-4">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#E43632] px-3 py-1 text-xs font-bold text-white shadow-lg">
              MOST POPULAR
            </div>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Growth</CardTitle>
              <CardDescription className="h-10 text-gray-400">
                For scaling operations with multiple processes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">$2,500</span>
                  <span className="font-medium text-gray-400">/ setup</span>
                </div>
                <div className="mt-2 text-sm font-medium text-emerald-400">+ Pay per task</div>
              </div>

              <Button
                asChild
                className="mb-8 w-full rounded-full bg-white font-bold text-black hover:bg-gray-100"
              >
                <Link href="/product">Start Building</Link>
              </Button>

              <ul className="space-y-3 text-sm text-gray-300">
                <li className="flex gap-2">
                  <Check size={16} className="text-emerald-400" /> Up to 5 Workflows
                </li>
                <li className="flex gap-2">
                  <Check size={16} className="text-emerald-400" /> Priority Build Queue
                </li>
                <li className="flex gap-2">
                  <Check size={16} className="text-emerald-400" /> Slack Connect Channel
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-sm transition-all border-gray-200 hover:border-gray-300">
            <CardHeader>
              <CardTitle className="text-2xl font-bold text-[#0A0A0A]">Enterprise</CardTitle>
              <CardDescription className="h-10">
                Full-service operations partnership.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#0A0A0A]">Custom</span>
                </div>
                <div className="mt-2 text-sm font-medium text-gray-500">Volume discounts available</div>
              </div>

              <Button
                asChild
                variant="outline"
                className="mb-8 w-full rounded-full font-bold"
              >
                <Link href="/contact">Contact Sales</Link>
              </Button>

              <ul className="space-y-3 text-sm text-gray-600">
                <li className="flex gap-2">
                  <Check size={16} className="text-emerald-500" /> Unlimited Workflows
                </li>
                <li className="flex gap-2">
                  <Check size={16} className="text-emerald-500" /> 24/7 Monitoring
                </li>
                <li className="flex gap-2">
                  <Check size={16} className="text-emerald-500" /> Dedicated Ops Manager
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20">
        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-lg md:p-12">
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Calculator size={24} />
            </div>
            <h2 className="text-3xl font-bold text-[#0A0A0A]">Estimate your unit price</h2>
            <p className="mt-2 text-gray-500">
              See how volume and complexity affect your cost per task.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-16 md:grid-cols-2">
            <div className="space-y-10">
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <label className="font-bold text-gray-700">Monthly Volume</label>
                  <Badge
                    variant="secondary"
                    className="border-blue-100 bg-blue-50 text-blue-700"
                  >
                    {volume[0].toLocaleString()} runs
                  </Badge>
                </div>
                <Slider value={volume} onValueChange={setVolume} max={10000} step={100} className="py-4" />
                <p className="mt-2 text-xs text-gray-400">
                  How many times per month does this happen?
                </p>
              </div>

              <div>
                <div className="mb-4 flex items-center justify-between">
                  <label className="font-bold text-gray-700">Task Complexity</label>
                  <Badge
                    variant="secondary"
                    className={
                      complexity[0] > 7
                        ? "border-amber-100 bg-amber-50 text-amber-700"
                        : "border-green-100 bg-green-50 text-green-700"
                    }
                  >
                    Level {complexity[0]}
                  </Badge>
                </div>
                <Slider value={complexity} onValueChange={setComplexity} max={10} step={1} className="py-4" />
                <p className="mt-2 text-xs text-gray-400">
                  1 = Simple data entry. 10 = Multi-step reasoning.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-gray-50 p-8 text-center">
              <div className="mb-6">
                <p className="mb-2 text-sm font-bold uppercase tracking-wider text-gray-400">
                  Estimated Unit Price
                </p>
                <div className="text-5xl font-bold tracking-tight text-[#0A0A0A]">
                  ${unitPrice.toFixed(2)}
                </div>
                <p className="mt-2 text-xs text-gray-400">per successful run</p>
              </div>

              <div className="my-4 h-px w-full bg-gray-200" />

              <div className="flex w-full justify-between text-sm">
                <span className="text-gray-500">Monthly Total:</span>
                <span className="font-bold text-[#0A0A0A]">
                  ${Math.round(total).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-20">
        <h3 className="mb-8 text-center text-2xl font-bold text-[#0A0A0A]">
          Frequently Asked Questions
        </h3>
        <div className="grid gap-6">
          {[
            {
              q: "How is the usage fee calculated?",
              a: 'We calculate usage based on the number of "runs" (successful executions) and the complexity (steps per run). You get a guaranteed price per run before we build anything.',
            },
            {
              q: "What happens if the automation breaks?",
              a: "WRK monitors all automations 24/7. If it fails due to a bug in our logic, we fix it for free immediately. If an API changes, we update it under your maintenance plan.",
            },
            {
              q: "Do I own the intellectual property?",
              a: "You own the data and the business logic. The underlying automation infrastructure is hosted on WRK platform.",
            },
          ].map((faq, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-colors hover:border-gray-300"
            >
              <h4 className="flex items-center gap-2 text-base font-bold text-[#0A0A0A]">
                <HelpCircle size={16} className="text-[#E43632]" /> {faq.q}
              </h4>
              <p className="ml-6 text-sm leading-relaxed text-gray-500">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-gray-200 bg-white py-16">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-6 md:flex-row">
          <div>
            <h3 className="mb-2 text-2xl font-bold text-[#0A0A0A]">
              Included with every plan
            </h3>
            <p className="text-gray-500">You always get the full power of the Studio platform.</p>
          </div>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { icon: Zap, label: "Studio Access" },
              { icon: FileCheck, label: "Audit Logs" },
              { icon: Users, label: "Unlimited Users" },
              { icon: Shield, label: "SOC 2 Compliance" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center gap-2 text-center"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-600">
                  <item.icon size={20} />
                </div>
                <span className="text-sm font-medium text-gray-500">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

