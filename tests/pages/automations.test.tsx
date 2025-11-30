import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AutomationsPage from "@/app/(studio)/automations/page";
import { mockAutomations } from "@/lib/mock-automations";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/automations",
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

describe("AutomationsPage", () => {
  it("renders without crashing", () => {
    render(<AutomationsPage />);
  });

  it("displays page title", () => {
    render(<AutomationsPage />);
    expect(screen.getByText("Automations")).toBeInTheDocument();
  });

  it("displays New Automation button", () => {
    render(<AutomationsPage />);
    const newButton = screen.getByText("New Automation");
    expect(newButton).toBeInTheDocument();
  });

  it("renders automation names when automations exist", () => {
    render(<AutomationsPage />);

    // Check that at least one automation name is rendered
    const firstAutomation = mockAutomations[0];
    if (firstAutomation) {
      expect(screen.getByText(firstAutomation.name)).toBeInTheDocument();
    }
  });

  it("displays search input", () => {
    render(<AutomationsPage />);
    const searchInput = screen.getByPlaceholderText("Search automations...");
    expect(searchInput).toBeInTheDocument();
  });
});
