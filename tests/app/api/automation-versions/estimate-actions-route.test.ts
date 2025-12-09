import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const requireTenantSessionMock = vi.fn();
const canMock = vi.fn();
const handleApiErrorMock = (error: unknown) =>
  new Response((error as Error).message, { status: (error as { status?: number }).status ?? 500 });
const selectMock = vi.fn();
const fromMock = vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve(selectMock())) })) }));
const loadCatalogMock = vi.fn();
const createCompletionMock = vi.fn();

vi.mock("@/lib/api/context", () => ({
  requireTenantSession: requireTenantSessionMock,
  handleApiError: handleApiErrorMock,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/auth/rbac", () => ({
  can: canMock,
}));

vi.mock("@/lib/pricing/wrkactions-catalog", () => ({
  loadWrkActionCatalog: loadCatalogMock,
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: fromMock }),
  },
}));

vi.mock("openai", () => {
  return {
    default: class OpenAI {
      chat = {
        completions: {
          create: createCompletionMock,
        },
      };
    },
  };
});

describe("POST /api/automation-versions/[id]/estimate-actions", () => {
  const params = { params: { id: "ver-1" } };

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
    requireTenantSessionMock.mockResolvedValue({ tenantId: "tenant-1", roles: ["workspace_admin"], userId: "u1" });
    canMock.mockReturnValue(true);
    selectMock.mockReturnValue([
      {
        id: "ver-1",
        tenantId: "tenant-1",
        workflowJson: {
          sections: [{ key: "business_requirements", title: "BR", content: "Do calls" }],
          steps: [{ id: "s1", title: "Call customer", description: "phone outreach" }],
        },
      },
    ]);
    loadCatalogMock.mockResolvedValue({
      "wrkaction-1": { listPrice: 0.25 },
      "wrkaction-2": { listPrice: 0.1 },
    });
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("returns parsed actions from OpenAI response", async () => {
    createCompletionMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: `{
  "actions": [
    { "actionType": "wrkaction-1", "count": 10 }
  ],
  "estimatedVolume": 500,
  "complexity": "medium"
}`,
          },
        },
      ],
    });

    const { POST } = await import("@/app/api/automation-versions/[id]/estimate-actions/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.estimatedActions).toEqual([{ actionType: "wrkaction-1", count: 10 }]);
    expect(json.estimatedVolume).toBe(500);
    expect(json.complexity).toBe("medium");
  });

  it("falls back when OpenAI key missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const { POST } = await import("@/app/api/automation-versions/[id]/estimate-actions/route");
    const res = await POST(new Request("http://localhost", { method: "POST" }), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.estimatedActions.length).toBeGreaterThan(0);
    expect(json.estimatedVolume).toBeGreaterThan(0);
  });
});

