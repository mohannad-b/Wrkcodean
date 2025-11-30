import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/layout/AppShell";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("AppShell", () => {
  it("renders without crashing", () => {
    render(
      <AppShell>
        <div>Test Content</div>
      </AppShell>
    );
  });

  it("renders sidebar and main content", () => {
    render(
      <AppShell>
        <div>Test Content</div>
      </AppShell>
    );

    // Check that main content is rendered
    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();
    expect(main).toHaveTextContent("Test Content");
  });

  it("applies correct layout classes", () => {
    const { container } = render(
      <AppShell>
        <div>Test</div>
      </AppShell>
    );

    const shell = container.firstChild;
    expect(shell).toHaveClass("h-screen", "bg-[#F5F5F5]");
  });
});
