import { describe, it, expect, beforeEach, vi } from "vitest";

const sessionMock = { userId: "u1", tenantId: "t1", roles: ["workspace_member"] };
const requireTenantSessionMock = vi.fn();
const canMock = vi.fn();
const getSubmissionDetailMock = vi.fn();
const getAutomationVersionDetailMock = vi.fn();

vi.mock("@/lib/api/context", () => ({
  requireTenantSession: requireTenantSessionMock,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  handleApiError: (error: any) =>
    new Response(JSON.stringify({ error: error.message }), { status: error.status ?? 500 }),
}));

vi.mock("@/lib/auth/rbac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/rbac")>("@/lib/auth/rbac");
  return {
    ...actual,
    can: canMock,
  };
});

vi.mock("@/lib/services/submissions", () => ({
  getSubmissionDetail: getSubmissionDetailMock,
}));

vi.mock("@/lib/services/automations", () => ({
  getAutomationVersionDetail: getAutomationVersionDetailMock,
}));

describe("GET /api/admin/projects/:id (detail) wrapper", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireTenantSessionMock.mockResolvedValue(sessionMock);
    canMock.mockImplementation((user: any, action: string) => {
      if (action === "admin:submission:read") return false;
      if (action === "automation:read") return true;
      return false;
    });
  });

  it("returns project detail with workflow and tasks when found by project id", async () => {
    getSubmissionDetailMock.mockResolvedValue({
      submission: {
        id: "proj-1",
        name: "Automation X",
        status: "BuildInProgress",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      },
      automation: {
        id: "auto-1",
        name: "Auto One",
        description: "desc",
      },
      version: {
        id: "ver-1",
        versionLabel: "v1",
        status: "BuildInProgress",
        intakeNotes: "notes",
        requirementsText: "reqs",
        intakeProgress: 80,
        workflowJson: {
          version: 1,
          status: "Draft",
          summary: "flow",
          sections: [],
          steps: [],
          branches: [],
          createdAt: "now",
          updatedAt: "now",
        },
      },
      quotes: [
        {
          id: "q1",
          status: "draft",
          setupFee: "100",
          unitPrice: "0.2",
          estimatedVolume: 1000,
          clientMessage: "msg",
        },
      ],
      tasks: [
        {
          id: "t1",
          title: "Do thing",
          status: "pending",
          priority: "important",
          dueDate: "2024-02-01",
          assignee: { id: "u2", name: "Alex", avatarUrl: "", title: "SE" },
        },
      ],
    });

    const { GET } = await import("@/app/api/admin/projects/[id]/route");
    const response = await GET(new Request("http://localhost"), { params: { id: "proj-1" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.submission.id).toBe("proj-1");
    expect(payload.submission.version.workflow).toBeDefined();
    expect(payload.submission.version.intakeProgress).toBe(80);
    expect(payload.submission.tasks).toHaveLength(1);
    expect(payload.submission.tasks[0].assignee?.name).toBe("Alex");
  });

  it("falls back to automation version detail when no project row exists", async () => {
    getSubmissionDetailMock.mockResolvedValue(null);
    getAutomationVersionDetailMock.mockResolvedValue({
      version: {
        id: "ver-2",
        versionLabel: "v2",
        status: "IntakeInProgress",
        intakeNotes: null,
        requirementsText: null,
        intakeProgress: 10,
        workflowJson: {
          version: 1,
          status: "Draft",
          summary: "",
          sections: [],
          steps: [],
          branches: [],
          createdAt: "now",
          updatedAt: "now",
        },
      },
      automation: { id: "auto-2", name: "Auto 2", description: null },
      submission: null,
      latestQuote: null,
      tasks: [{ id: "t2", title: "Setup", status: "pending", priority: "optional", dueDate: null }],
    });

    const { GET } = await import("@/app/api/admin/projects/[id]/route");
    const response = await GET(new Request("http://localhost"), { params: { id: "ver-2" } });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.submission.id).toBe("ver-2");
    expect(payload.submission.version.workflow).toBeDefined();
    expect(payload.submission.tasks).toHaveLength(1);
    // fallback tasks do not include assignee details
    expect(payload.submission.tasks[0].assignee).toBeNull();
  });

  it("returns 403 when user lacks permissions", async () => {
    canMock.mockReturnValue(false);
    const { GET } = await import("@/app/api/admin/projects/[id]/route");
    const response = await GET(new Request("http://localhost"), { params: { id: "proj-1" } });
    expect(response.status).toBe(403);
  });
});

