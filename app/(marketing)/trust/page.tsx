import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileText,
  Globe,
  Lock,
  Server,
  Shield,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function TrustPage() {
  return (
    <div className="bg-white pt-20 font-sans text-[#0A0A0A]">
      <section className="relative overflow-hidden bg-[#F9FAFB] px-6 py-24">
        <div className="relative z-10 mx-auto max-w-7xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
            <Shield size={14} /> Trust Center
          </div>
          <h1 className="mb-6 text-4xl font-bold tracking-tight text-[#0A0A0A] md:text-6xl">
            Security is our <br className="hidden md:block" />
            <span className="bg-gradient-to-r from-[#0A0A0A] to-[#666] bg-clip-text text-transparent">
              operating system.
            </span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-xl leading-relaxed text-gray-500">
            We process critical data for modern operations teams. That’s why we’ve built
            enterprise-grade security, compliance, and privacy into every layer of WrkCoPilot.
          </p>
          <div className="flex justify-center gap-4">
            <Button size="lg" className="h-12 rounded-full bg-[#0A0A0A] px-8 font-bold text-white hover:bg-[#333]">
              Download SOC 2 Report
            </Button>
            <Button variant="outline" size="lg" className="h-12 rounded-full px-8 font-bold">
              Contact Security Team
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-gray-100 bg-white px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                title: "SOC 2 Type II",
                icon: CheckCircle2,
                body:
                  "We are SOC 2 Type II compliant. Our controls are audited annually by an independent third-party firm to ensure we meet the highest standards for security, availability, and confidentiality.",
                link: "/contact",
                linkLabel: "Request Report →",
                color: "bg-emerald-100 text-emerald-600",
              },
              {
                title: "GDPR & CCPA",
                icon: Globe,
                body:
                  "We are fully compliant with GDPR and CCPA regulations. We provide tools for data subject access requests (DSAR) and ensure your customer data is handled with respect to their privacy rights.",
                link: "/privacy",
                linkLabel: "View Privacy Policy →",
                color: "bg-blue-100 text-blue-600",
              },
              {
                title: "Encryption",
                icon: Lock,
                body:
                  "Data is encrypted in transit using TLS 1.2+ and at rest using AES-256. We use industry-standard key management and rotation policies to protect your sensitive information.",
                link: "/trust",
                linkLabel: "Security Overview →",
                color: "bg-purple-100 text-purple-600",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-8 transition-all hover:shadow-md"
              >
                <div className={`mb-6 flex h-12 w-12 items-center justify-center rounded-full ${item.color}`}>
                  <item.icon size={24} />
                </div>
                <h3 className="mb-2 text-xl font-bold">{item.title}</h3>
                <p className="mb-4 text-sm leading-relaxed text-gray-500">{item.body}</p>
                <Link className="text-sm font-bold text-[#E43632] hover:underline" href={item.link}>
                  {item.linkLabel}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-6 py-24">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-16 lg:grid-cols-2">
          <div>
            <h2 className="mb-6 text-3xl font-bold">Comprehensive Security Controls</h2>
            <p className="mb-8 text-gray-500">
              Security isn't just a checkbox. It's woven into our SDLC, infrastructure, and personnel
              policies.
            </p>

            <div className="space-y-6">
              <div className="flex gap-4">
                <Server className="shrink-0 text-gray-400" size={24} />
                <div>
                  <h4 className="font-bold text-[#0A0A0A]">Infrastructure Security</h4>
                  <p className="mt-1 text-sm text-gray-500">
                    Hosted on AWS with strict VPC isolation, intrusion detection, and regular
                    vulnerability scanning.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <Eye className="shrink-0 text-gray-400" size={24} />
                <div>
                  <h4 className="font-bold text-[#0A0A0A]">Access Control</h4>
                  <p className="mt-1 text-sm text-gray-500">
                    Principle of least privilege access for all employees. MFA enforced everywhere.
                    Regular access reviews.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <FileText className="shrink-0 text-gray-400" size={24} />
                <div>
                  <h4 className="font-bold text-[#0A0A0A]">Penetration Testing</h4>
                  <p className="mt-1 text-sm text-gray-500">
                    Annual penetration tests performed by top-tier security firms. Remediation timelines
                    are strictly enforced.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <AlertTriangle className="shrink-0 text-gray-400" size={24} />
                <div>
                  <h4 className="font-bold text-[#0A0A0A]">Incident Response</h4>
                  <p className="mt-1 text-sm text-gray-500">
                    24/7 incident response team with defined escalation paths and communication
                    protocols.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-8">
            <h3 className="mb-6 text-xl font-bold">Subprocessors</h3>
            <div className="space-y-4">
              {[
                { name: "Amazon Web Services (AWS)", purpose: "Cloud Infrastructure", location: "USA" },
                { name: "MongoDB Atlas", purpose: "Database Hosting", location: "USA" },
                { name: "OpenAI", purpose: "AI Model Inference", location: "USA" },
                { name: "Auth0", purpose: "Authentication", location: "USA" },
                { name: "Stripe", purpose: "Payment Processing", location: "USA" },
              ].map((proc) => (
                <div
                  key={proc.name}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-bold text-[#0A0A0A]">{proc.name}</p>
                    <p className="text-xs text-gray-500">{proc.purpose}</p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-[10px] text-gray-500 bg-gray-100 border-gray-200"
                  >
                    {proc.location}
                  </Badge>
                </div>
              ))}
            </div>
            <div className="mt-6 border-t border-gray-200 pt-6 text-center text-xs text-gray-400">
              Last updated: November 1, 2023
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

