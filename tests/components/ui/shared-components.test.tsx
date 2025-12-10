import { render, screen } from "@testing-library/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";

describe("shared UI components", () => {
  it("renders PageHeader with title, subtitle, and actions", () => {
    render(
      <PageHeader
        title="Automations"
        subtitle="Manage your workflows."
        actions={<button>New</button>}
      />
    );

    expect(screen.getByRole("heading", { name: "Automations" })).toBeInTheDocument();
    expect(screen.getByText("Manage your workflows.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });

  it("renders SectionCard with heading, description, and children", () => {
    render(
      <SectionCard
        title="Filters"
        description="Refine the list."
      >
        <div>Child content</div>
      </SectionCard>
    );

    expect(screen.getByRole("heading", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByText("Refine the list.")).toBeInTheDocument();
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("maps known automation statuses to branded badge styles", () => {
    render(<StatusBadge status="NeedsPricing" />);
    const badge = screen.getByText(/needs pricing/i);

    expect(badge).toHaveClass("bg-amber-50");
    expect(badge).toHaveClass("text-amber-700");
    expect(badge).toHaveClass("border-amber-200");
  });

  it("falls back gracefully for unknown statuses", () => {
    render(<StatusBadge status="CustomStatus" />);
    const badge = screen.getByText("CustomStatus");

    expect(badge).toHaveClass("bg-gray-50");
    expect(badge).toHaveClass("text-gray-600");
  });
});
