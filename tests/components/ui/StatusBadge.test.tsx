import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/ui/StatusBadge";

describe("StatusBadge", () => {
  it("renders with correct text", () => {
    render(<StatusBadge status="Live" />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("applies correct CSS classes for Live status", () => {
    const { container } = render(<StatusBadge status="Live" />);
    const badge = container.querySelector('span[data-slot="badge"]');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-emerald-100", "text-emerald-800");
  });

  it("applies correct CSS classes for Build in Progress status", () => {
    const { container } = render(<StatusBadge status="Build in Progress" />);
    const badge = container.querySelector('span[data-slot="badge"]');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-red-50", "text-[#E43632]");
  });

  it("applies correct CSS classes for Blocked status", () => {
    const { container } = render(<StatusBadge status="Blocked" />);
    const badge = container.querySelector('span[data-slot="badge"]');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-orange-50", "text-orange-700");
  });

  it("handles unknown status gracefully", () => {
    render(<StatusBadge status="Unknown Status" />);
    expect(screen.getByText("Unknown Status")).toBeInTheDocument();
  });
});
