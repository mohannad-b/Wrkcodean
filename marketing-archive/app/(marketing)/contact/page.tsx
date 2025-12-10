import Link from "next/link";
import { Mail, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ContactPage() {
  return (
    <div className="bg-[#F9FAFB] text-[#0A0A0A] min-h-screen pt-28 pb-20">
      <section className="max-w-4xl mx-auto px-6 text-center space-y-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
          Contact
        </p>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Talk to the WRK team
        </h1>
        <p className="text-lg text-gray-500 leading-relaxed max-w-2xl mx-auto">
          Tell us about your process, ask pricing questions, or request a security review. We’ll
          respond within one business day.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            asChild
            size="lg"
            className="h-12 rounded-full bg-[#0A0A0A] px-8 text-white"
          >
            <a href="mailto:hello@wrkcopilot.com?subject=Let%27s%20talk%20automation">
              Email hello@wrkcopilot.com
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 rounded-full border-gray-300 px-8"
          >
            <Link href="/pricing">
              View pricing
            </Link>
          </Button>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 mt-16 grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#E43632] mb-3">
            <Mail size={16} /> Direct line
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            Email us with your goals, systems, and timeline. We’ll route you to the right specialist.
          </p>
          <a
            className="mt-4 inline-flex text-sm font-semibold text-[#E43632] hover:underline"
            href="mailto:hello@wrkcopilot.com?subject=Let%27s%20talk%20automation"
          >
            hello@wrkcopilot.com
          </a>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0A0A0A] mb-3">
            <MessageSquare size={16} /> Prefer chat?
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            Share a short brief and we’ll send back a proposed blueprint and pricing estimate.
          </p>
          <Link
            href="/resources"
            className="mt-4 inline-flex text-sm font-semibold text-[#E43632] hover:underline"
          >
            Browse resources
          </Link>
        </div>
      </section>
    </div>
  );
}

