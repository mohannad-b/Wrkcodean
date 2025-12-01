import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AutomationsPage from "@/app/(studio)/automations/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const fetchMock = vi.fn();

describe("AutomationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as unknown as { fetch: typeof fetch }).fetch = fetchMock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        automations: [
          {
            id: "auto-1",
            name: "Invoice Processing",
            description: "Process invoices automatically",
            latestVersion: {
              id: "ver-1",
              versionLabel: "v1.0",
              status: "DRAFT",
              intakeNotes: "Initial notes",
              updatedAt: null,
            },
          },
        ],
      }),
    });
  });

  afterEach(() => {
    fetchMock.mockReset();
  });

  it("renders without crashing", async () => {
    render(<AutomationsPage />);
    expect(await screen.findByText("Automations")).toBeInTheDocument();
  });

  it("displays page title", async () => {
    render(<AutomationsPage />);
    expect(await screen.findByText("Automations")).toBeInTheDocument();
  });

  it("displays New Automation button", async () => {
    render(<AutomationsPage />);
    expect(await screen.findByText("New Automation")).toBeInTheDocument();
  });

  it("renders automation names returned from the API", async () => {
    render(<AutomationsPage />);
    expect(await screen.findByText("Invoice Processing")).toBeInTheDocument();
  });
});
