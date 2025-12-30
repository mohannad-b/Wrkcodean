import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireTenantSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/context", () => ({
  requireTenantSession: requireTenantSessionMock,
  handleApiError: (error: unknown) =>
    new Response((error as Error).message, {
      status: (error as { status?: number }).status ?? 500,
    }),
}));

// Mock OpenAI
const mockCreate = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  },
}));

import { POST } from "@/app/api/ai/suggest-use-cases/route";

describe("POST /api/ai/suggest-use-cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireTenantSessionMock.mockResolvedValue({ userId: "user-1", tenantId: "tenant-1" });
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("requires context parameter", async () => {
    const request = new NextRequest("http://localhost/api/ai/suggest-use-cases", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Context is required");
  });

  it("calls OpenAI with system context when selectedSystem is provided", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              useCases: [
                {
                  text: "Process Shopify orders to QuickBooks",
                  description: "Automatically process orders from Shopify and sync to QuickBooks",
                },
              ],
            }),
          },
        },
      ],
    });

    const request = new NextRequest("http://localhost/api/ai/suggest-use-cases", {
      method: "POST",
      body: JSON.stringify({
        context: "Industry: Retail & E-commerce",
        selectedSystem: "Shopify",
        availableSystems: ["Shopify", "Amazon", "WooCommerce"],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(mockCreate).toHaveBeenCalled();
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[1].content).toContain("Shopify");
    expect(callArgs.messages[1].content).toMatch(/prioritize workflows that prominently feature Shopify/i);
  });

  it("includes available systems in prompt when no system is selected", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              useCases: [
                {
                  text: "Process invoices from Gmail to Xero",
                  description: "Sync invoices to Xero accounting",
                },
              ],
            }),
          },
        },
      ],
    });

    const request = new NextRequest("http://localhost/api/ai/suggest-use-cases", {
      method: "POST",
      body: JSON.stringify({
        context: "Industry: Finance & Banking",
        selectedSystem: null,
        availableSystems: ["QuickBooks", "Xero", "Sage", "NetSuite"],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(mockCreate).toHaveBeenCalled();
    const callArgs = mockCreate.mock.calls[0][0];
    const userContent = callArgs.messages[1].content;
    expect(userContent).toContain("QuickBooks, Xero, Sage, NetSuite");
    expect(userContent).toContain("prioritize using these specific systems");
  });

  it("returns fallback suggestions when OpenAI API key is not set", async () => {
    delete process.env.OPENAI_API_KEY;

    const request = new NextRequest("http://localhost/api/ai/suggest-use-cases", {
      method: "POST",
      body: JSON.stringify({
        context: "Industry: Technology",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.useCases).toBeDefined();
    expect(Array.isArray(data.useCases)).toBe(true);
    expect(data.useCases.length).toBeGreaterThan(0);

    // Restore for other tests
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("parses and returns use cases from OpenAI response", async () => {
    const mockUseCases = [
      {
        text: "Sync Shopify orders to QuickBooks",
        description: "Automatically sync orders from Shopify to QuickBooks accounting",
      },
      {
        text: "Process returns from Shopify to Stripe",
        description: "Handle returns and refunds automatically",
      },
    ];

    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ useCases: mockUseCases }),
          },
        },
      ],
    });

    const request = new NextRequest("http://localhost/api/ai/suggest-use-cases", {
      method: "POST",
      body: JSON.stringify({
        context: "Industry: Retail & E-commerce",
        selectedSystem: "Shopify",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.useCases).toEqual(mockUseCases);
  });

  it("limits use cases to 6 maximum", async () => {
    const mockUseCases = Array.from({ length: 10 }, (_, i) => ({
      text: `Workflow ${i + 1}`,
      description: `Description ${i + 1}`,
    }));

    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ useCases: mockUseCases }),
          },
        },
      ],
    });

    const request = new NextRequest("http://localhost/api/ai/suggest-use-cases", {
      method: "POST",
      body: JSON.stringify({
        context: "Industry: Technology",
      }),
    });

    const response = await POST(request);
    const data = await response.json();
    expect(data.useCases.length).toBe(6);
  });

  it("handles invalid JSON response from OpenAI", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: "Invalid JSON response",
          },
        },
      ],
    });

    const request = new NextRequest("http://localhost/api/ai/suggest-use-cases", {
      method: "POST",
      body: JSON.stringify({
        context: "Industry: Technology",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
  });

  it("handles empty use cases array from OpenAI", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ useCases: [] }),
          },
        },
      ],
    });

    const request = new NextRequest("http://localhost/api/ai/suggest-use-cases", {
      method: "POST",
      body: JSON.stringify({
        context: "Industry: Technology",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
  });

  it("includes system-specific instructions in system prompt", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              useCases: [
                {
                  text: "Test workflow",
                  description: "Test description",
                },
              ],
            }),
          },
        },
      ],
    });

    const request = new NextRequest("http://localhost/api/ai/suggest-use-cases", {
      method: "POST",
      body: JSON.stringify({
        context: "Industry: Finance & Banking",
        selectedSystem: "Xero",
      }),
    });

    await POST(request);

    const callArgs = mockCreate.mock.calls[0][0];
    const systemPrompt = callArgs.messages[0].content;
    expect(systemPrompt).toContain("explicitly name specific systems/platforms");
    expect(systemPrompt).toContain("use actual system names");
    expect(systemPrompt).toContain("avoid generic terms");
  });

  it("handles missing OpenAI response content", async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {},
        },
      ],
    });

    const request = new NextRequest("http://localhost/api/ai/suggest-use-cases", {
      method: "POST",
      body: JSON.stringify({
        context: "Industry: Technology",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
  });
});

