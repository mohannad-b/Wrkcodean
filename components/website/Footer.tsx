import Link from "next/link";
import React from "react";
import { Github, Linkedin, Twitter } from "lucide-react";
import { WrkLogo } from "@/components/brand/WrkLogo";

export const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-gray-200 pt-20 pb-10 text-gray-600">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 grid grid-cols-1 gap-12 md:grid-cols-4">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <WrkLogo width={90} height={58} />
              <span className="text-lg font-bold text-[#0A0A0A]">
                WRK Copilot
              </span>
            </div>
            <p className="text-sm leading-relaxed text-gray-500">
              The AI-powered automation copilot that turns messy processes into
              production-grade workflows without builders.
            </p>
            <div className="flex gap-4 pt-2">
              {[Twitter, Linkedin, Github].map((Icon, index) => (
                <div
                  key={index}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-gray-400 transition-colors hover:bg-[#E43632] hover:text-white hover:border-[#E43632]"
                >
                  <Icon size={16} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#0A0A0A]">
              Product
            </h4>
            <ul className="space-y-3 text-sm text-gray-500">
              <li>
                <Link href="/product" className="transition-colors hover:text-[#E43632]">
                  Studio
                </Link>
              </li>
              <li>
                <Link href="/product" className="transition-colors hover:text-[#E43632]">
                  Blueprint Engine
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="transition-colors hover:text-[#E43632]">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/trust" className="transition-colors hover:text-[#E43632]">
                  Security
                </Link>
              </li>
              <li>
                <Link href="/resources" className="transition-colors hover:text-[#E43632]">
                  Changelog
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#0A0A0A]">
              Resources
            </h4>
            <ul className="space-y-3 text-sm text-gray-500">
              <li>
                <Link
                  href="/use-cases"
                  className="transition-colors hover:text-[#E43632]"
                >
                  Use Cases
                </Link>
              </li>
              <li>
                <Link
                  href="/resources"
                  className="transition-colors hover:text-[#E43632]"
                >
                  Documentation
                </Link>
              </li>
              <li>
                <span className="cursor-default transition-colors hover:text-[#E43632]">
                  API Reference
                </span>
              </li>
              <li>
                <span className="cursor-default transition-colors hover:text-[#E43632]">
                  Community
                </span>
              </li>
              <li>
                <span className="cursor-default transition-colors hover:text-[#E43632]">
                  Blog
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#0A0A0A]">
              Company
            </h4>
            <ul className="space-y-3 text-sm text-gray-500">
              <li>
                <span className="cursor-default transition-colors hover:text-[#E43632]">
                  About WRK
                </span>
              </li>
              <li>
                <span className="cursor-default transition-colors hover:text-[#E43632]">
                  Careers
                </span>
              </li>
              <li>
                <span className="cursor-default transition-colors hover:text-[#E43632]">
                  Legal
                </span>
              </li>
              <li>
                <span className="cursor-default transition-colors hover:text-[#E43632]">
                  Contact
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-200 pt-8 text-xs text-gray-500 md:flex-row">
          <div>
            &copy; {new Date().getFullYear()} WRK Automation Inc. All rights
            reserved.
          </div>
          <div className="flex gap-8">
            <Link href="/privacy" className="transition-colors hover:text-[#E43632]">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-[#E43632]">
              Terms of Service
            </Link>
            <Link href="/trust" className="transition-colors hover:text-[#E43632]">
              Security
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};
