'use client';

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

const navLinks = [
  { href: "/product", label: "Product" },
  { href: "/blueprints", label: "Blueprints" },
  { href: "/pricing", label: "Pricing" },
  { href: "/resources", label: "Resources" },
];

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname?.startsWith(href);

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b",
        isScrolled
          ? "bg-white/90 backdrop-blur border-gray-100 py-4 shadow-sm"
          : "bg-transparent border-transparent py-6"
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
        <Link
          href="/"
          className="group flex items-center gap-3 rounded-full transition-colors hover:text-[#E43632]"
        >
          <div className="h-8 w-auto">
            <Image
              src="/assets/wrk-logo.png"
              alt="WRK Copilot"
              width={120}
              height={32}
              className="h-8 w-auto object-contain"
              priority
            />
          </div>
        </Link>

        <div className="hidden items-center gap-10 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-[#E43632]",
                isActive(link.href) ? "text-[#0A0A0A]" : "text-gray-500"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-4 md:flex">
          <Button
            asChild
            variant="ghost"
            className="text-sm font-semibold text-gray-600 hover:text-[#0A0A0A]"
          >
            <Link href="/trust">Trust</Link>
          </Button>
          <Button
            asChild
            className="rounded-full bg-[#0A0A0A] px-6 text-white transition-colors hover:bg-black"
          >
            <Link href="/pricing">Start designing my workflow</Link>
          </Button>
        </div>

        <button
          className="md:hidden rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-white"
          onClick={() => setIsMobileMenuOpen((open) => !open)}
          aria-label="Toggle navigation menu"
        >
          {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl space-y-4 px-6 py-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={cn(
                  "block w-full text-left text-sm font-medium transition-colors hover:text-[#E43632]",
                  isActive(link.href) ? "text-[#0A0A0A]" : "text-gray-700"
                )}
              >
                {link.label}
              </Link>
            ))}
            <div className="space-y-3 pt-2">
              <Button
                asChild
                className="w-full rounded-full bg-[#0A0A0A] text-white"
              >
                <Link href="/pricing">Try WRK Copilot</Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                className="w-full text-gray-600"
              >
                <Link href="/trust">Security &amp; Trust</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};
