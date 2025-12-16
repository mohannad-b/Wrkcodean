import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useRouter } from "next/navigation";
import NewAutomationPage from "@/app/(app)/(studio)/automations/new/page";

// Mock next/navigation
const mockPush = vi.fn();
const mockRouter = {
  push: mockPush,
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// Mock useToast
const mockToast = vi.fn();
vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => mockToast,
}));

describe("NewAutomationPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockPush.mockClear();
    mockToast.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the form with industry, department, and systems dropdowns", () => {
    render(<NewAutomationPage />);

    expect(screen.getByLabelText(/industry/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/department/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/systems/i)).toBeInTheDocument();
  });

  it("disables systems dropdown when no industry is selected", () => {
    render(<NewAutomationPage />);

    const systemsDropdown = screen.getByLabelText(/systems/i);
    expect(systemsDropdown).toBeDisabled();
    expect(systemsDropdown).toHaveAttribute("aria-disabled", "true");
  });

  it("enables systems dropdown and shows systems when industry is selected", async () => {
    render(<NewAutomationPage />);

    // Select an industry - need to trigger the Select properly
    const industryTrigger = screen.getByLabelText(/industry/i);
    
    // Click to open the dropdown
    fireEvent.mouseDown(industryTrigger);
    
    // Wait for and click the option
    const retailOption = await screen.findByText("Retail & E-commerce", {}, { timeout: 2000 });
    fireEvent.click(retailOption);

    // Check that systems dropdown is enabled
    const systemsDropdown = screen.getByLabelText(/systems/i);
    await waitFor(() => {
      expect(systemsDropdown).not.toHaveAttribute("aria-disabled", "true");
    }, { timeout: 2000 });

    // Open systems dropdown and check for Shopify
    fireEvent.mouseDown(systemsDropdown);
    await waitFor(() => {
      expect(screen.getByText("Shopify")).toBeInTheDocument();
      expect(screen.getByText("Amazon")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("filters workflows to show only those matching selected system", async () => {
    render(<NewAutomationPage />);

    // Select Retail & E-commerce industry
    const industryTrigger = screen.getByLabelText(/industry/i);
    fireEvent.mouseDown(industryTrigger);
    const retailOption = await screen.findByText("Retail & E-commerce");
    fireEvent.click(retailOption);

    // Wait for workflows to appear
    await waitFor(() => {
      expect(screen.getByText(/Sync Shopify orders/i)).toBeInTheDocument();
    }, { timeout: 2000 });

    // Select Shopify system
    const systemsTrigger = screen.getByLabelText(/systems/i);
    await waitFor(() => {
      expect(systemsTrigger).not.toHaveAttribute("aria-disabled", "true");
    });
    fireEvent.mouseDown(systemsTrigger);
    const shopifyOption = await screen.findByText("Shopify");
    fireEvent.click(shopifyOption);

    // Wait for workflows to filter - should only show Shopify-related workflows
    await waitFor(() => {
      // Get all workflow buttons (they're button elements with use case text)
      const workflowButtons = screen.getAllByRole("button").filter((btn) => {
        const text = btn.textContent || "";
        return text.match(/Sync|Process|Update|Send|Automate/i) && !text.match(/AI suggest|Create Automation/i);
      });
      
      // All visible workflows should mention Shopify
      expect(workflowButtons.length).toBeGreaterThan(0);
      workflowButtons.forEach((workflow) => {
        const text = workflow.textContent?.toLowerCase() || "";
        expect(text).toContain("shopify");
      });
    }, { timeout: 2000 });
  });

  it("resets systems dropdown when industry changes", async () => {
    render(<NewAutomationPage />);

    // Select Retail & E-commerce
    const industryTrigger = screen.getByLabelText(/industry/i);
    fireEvent.mouseDown(industryTrigger);
    const retailOption = await screen.findByText("Retail & E-commerce");
    fireEvent.click(retailOption);

    // Select Shopify
    const systemsTrigger = screen.getByLabelText(/systems/i);
    await waitFor(() => {
      expect(systemsTrigger).not.toHaveAttribute("aria-disabled", "true");
    });
    fireEvent.mouseDown(systemsTrigger);
    const shopifyOption = await screen.findByText("Shopify");
    fireEvent.click(shopifyOption);

    // Change industry to Finance & Banking
    fireEvent.mouseDown(industryTrigger);
    const financeOption = await screen.findByText("Finance & Banking");
    fireEvent.click(financeOption);

    // System should be reset - check that placeholder appears
    await waitFor(() => {
      const systemsDropdownAfter = screen.getByLabelText(/systems/i);
      // The placeholder text should indicate no selection
      expect(systemsDropdownAfter.textContent?.toLowerCase()).toMatch(/select/i);
    }, { timeout: 2000 });

    // Finance systems should be available
    fireEvent.mouseDown(screen.getByLabelText(/systems/i));
    await waitFor(() => {
      expect(screen.getByText("QuickBooks")).toBeInTheDocument();
      expect(screen.getByText("Xero")).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("includes selected system in AI suggest use cases API call", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ useCases: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<NewAutomationPage />);

    // Select industry and system
    const industryTrigger = screen.getByLabelText(/industry/i);
    fireEvent.mouseDown(industryTrigger);
    const retailOption = await screen.findByText("Retail & E-commerce");
    fireEvent.click(retailOption);

    const systemsTrigger = screen.getByLabelText(/systems/i);
    await waitFor(() => {
      expect(systemsTrigger).not.toHaveAttribute("aria-disabled", "true");
    });
    fireEvent.mouseDown(systemsTrigger);
    const shopifyOption = await screen.findByText("Shopify");
    fireEvent.click(shopifyOption);

    // Click AI suggest more button
    const aiSuggestButton = screen.getByRole("button", { name: /ai suggest more/i });
    fireEvent.click(aiSuggestButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/ai/suggest-use-cases",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    }, { timeout: 2000 });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody.selectedSystem).toBe("Shopify");
    expect(requestBody.availableSystems).toEqual(
      expect.arrayContaining(["Shopify", "Amazon", "WooCommerce"])
    );
  });

  it("shows workflows filtered by system when system is selected", async () => {
    render(<NewAutomationPage />);

    // Select Finance & Banking
    const industryTrigger = screen.getByLabelText(/industry/i);
    fireEvent.mouseDown(industryTrigger);
    const financeOption = await screen.findByText("Finance & Banking");
    fireEvent.click(financeOption);

    // Wait for workflows
    await waitFor(() => {
      expect(screen.getByText(/Process invoices from Gmail/i)).toBeInTheDocument();
    }, { timeout: 2000 });

    // Select Xero
    const systemsTrigger = screen.getByLabelText(/systems/i);
    await waitFor(() => {
      expect(systemsTrigger).not.toHaveAttribute("aria-disabled", "true");
    });
    fireEvent.mouseDown(systemsTrigger);
    const xeroOption = await screen.findByText("Xero");
    fireEvent.click(xeroOption);

    // Should only show Xero-related workflows
    await waitFor(() => {
      const workflows = screen.getAllByRole("button").filter((w) => {
        const text = w.textContent?.toLowerCase() || "";
        return text.match(/process|sync|generate|monitor|automate|send payment/i) && !text.match(/ai suggest|create automation/i);
      });
      const xeroWorkflows = workflows.filter((w) => {
        const text = w.textContent?.toLowerCase() || "";
        return text.includes("xero");
      });
      // At least one workflow should mention Xero
      expect(xeroWorkflows.length).toBeGreaterThan(0);
    }, { timeout: 2000 });
  });

  it("shows all workflows when no system is selected", async () => {
    render(<NewAutomationPage />);

    // Select Finance & Banking
    const industryTrigger = screen.getByLabelText(/industry/i);
    fireEvent.mouseDown(industryTrigger);
    const financeOption = await screen.findByText("Finance & Banking");
    fireEvent.click(financeOption);

    // Should show all workflows for the industry
    await waitFor(() => {
      expect(screen.getByText(/Process invoices from Gmail/i)).toBeInTheDocument();
      expect(screen.getByText(/Monitor transactions in Stripe/i)).toBeInTheDocument();
      expect(screen.getByText(/Generate financial reports from QuickBooks/i)).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it("includes available systems in AI suggest call even when no system is selected", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ useCases: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    render(<NewAutomationPage />);

    // Select industry only (no system)
    const industryTrigger = screen.getByLabelText(/industry/i);
    fireEvent.mouseDown(industryTrigger);
    const financeOption = await screen.findByText("Finance & Banking");
    fireEvent.click(financeOption);

    // Click AI suggest more
    const aiSuggestButton = screen.getByRole("button", { name: /ai suggest more/i });
    fireEvent.click(aiSuggestButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(requestBody.selectedSystem).toBeNull();
      expect(requestBody.availableSystems).toEqual(
        expect.arrayContaining(["QuickBooks", "Xero", "Sage", "NetSuite"])
      );
    }, { timeout: 2000 });
  });

  it("creates automation with selected industry", async () => {
    fetchMock.mockImplementation((url, init) => {
      const method = init?.method ?? "GET";
      if (typeof url === "string" && url === "/api/automations" && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              automation: {
                id: "auto-123",
                name: "Test Automation",
                version: { id: "version-123" },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    render(<NewAutomationPage />);

    // Fill in form
    const industryTrigger = screen.getByLabelText(/industry/i);
    fireEvent.mouseDown(industryTrigger);
    const financeOption = await screen.findByText("Finance & Banking");
    fireEvent.click(financeOption);

    const descriptionTextarea = screen.getByLabelText(/process description/i);
    fireEvent.change(descriptionTextarea, {
      target: { value: "Process invoices automatically" },
    });

    // Submit form
    const submitButton = screen.getByRole("button", { name: /create automation/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/automations",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(requestBody).toMatchObject({
        automationType: "intermediate",
        processDescription: "Process invoices automatically",
        industry: "Finance & Banking",
      });
    }, { timeout: 2000 });
  });
});

