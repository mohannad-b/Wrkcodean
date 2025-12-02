import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShellClient } from "@/components/layout/AppShell";

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
      <AppShellClient initialProfile={null} initialLastUpdatedAt={null}>
        <div>Test Content</div>
      </AppShellClient>
    );
  });

  it("renders sidebar and main content", () => {
    render(
      <AppShellClient initialProfile={null} initialLastUpdatedAt={null}>
        <div>Test Content</div>
      </AppShellClient>
    );

    // Check that main content is rendered
    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();
    expect(main).toHaveTextContent("Test Content");
  });

  it("applies correct layout classes", () => {
    const { container } = render(
      <AppShellClient initialProfile={null} initialLastUpdatedAt={null}>
        <div>Test</div>
      </AppShellClient>
    );

    const shell = container.firstChild;
    expect(shell).toHaveClass("h-screen", "bg-[#F5F5F5]");
  });
});
