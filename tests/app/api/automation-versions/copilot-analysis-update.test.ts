import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyWorkflowSpec } from "@/lib/workflows/factory";

const requireTenantSessionMock = vi.fn();
const canMock = vi.fn();
const ensureRateLimitMock = vi.fn();
const getAutomationVersionDetailMock = vi.fn();
const listCopilotMessagesMock = vi.fn();
const createCopilotMessageMock = vi.fn();
const buildWorkflowFromChatMock = vi.fn();
const syncAutomationTasksMock = vi.fn();
const evaluateWorkflowProgressMock = vi.fn();
const getCopilotAnalysisMock = vi.fn();
const upsertCopilotAnalysisMock = vi.fn();
const determineConversationPhaseMock = vi.fn();
const generateThinkingStepsMock = vi.fn();
const logAuditMock = vi.fn();
const revalidatePathMock = vi.fn();

const returningMock = vi.fn();
const whereMock = vi.fn(() => ({ returning: returningMock }));
const setMock = vi.fn(() => ({ where: whereMock }));
const updateMock = vi.fn(() => ({ set: setMock }));

vi.mock("@/lib/api/context", () => ({
  requireTenantSession: requireTenantSessionMock,
  handleApiError: (error: unknown) =>
    new Response((error as Error).message, { status: (error as { status?: number }).status ?? 500 }),
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

vi.mock("@/lib/rate-limit", () => ({
  ensureRateLimit: ensureRateLimitMock,
  buildRateLimitKey: (...parts: string[]) => parts.join(":"),
}));

vi.mock("@/lib/services/automations", () => ({
  getAutomationVersionDetail: getAutomationVersionDetailMock,
}));

vi.mock("@/lib/services/copilot-messages", () => ({
  listCopilotMessages: listCopilotMessagesMock,
  createCopilotMessage: createCopilotMessageMock,
}));

vi.mock("@/lib/services/copilot-analysis", () => ({
  getCopilotAnalysis: getCopilotAnalysisMock,
  upsertCopilotAnalysis: upsertCopilotAnalysisMock,
}));

vi.mock("@/lib/ai/copilot-orchestrator", () => ({
  determineConversationPhase: determineConversationPhaseMock,
  generateThinkingSteps: generateThinkingStepsMock,
}));

vi.mock("@/lib/ai/copilot-debug", () => ({
  copilotDebug: vi.fn(),
}));

vi.mock("@/lib/dev/agent-log", () => ({
  sendDevAgentLog: vi.fn(),
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: logAuditMock,
}));

vi.mock("@/lib/workflows/ai-builder-simple", () => ({
  buildWorkflowFromChat: buildWorkflowFromChatMock,
}));

vi.mock("@/lib/workflows/task-sync", () => ({
  syncAutomationTasks: syncAutomationTasksMock,
}));

vi.mock("@/lib/workflows/step-numbering", () => ({
  applyStepNumbers: (workflow: any) => workflow,
}));

vi.mock("@/lib/workflows/diff", () => ({
  diffWorkflow: () => ({ summary: [], stepsAdded: [], stepsRemoved: [], stepsRenamed: [], branchesAdded: [], branchesRemoved: [] }),
}));

vi.mock("@/lib/workflows/legacy", () => ({
  withLegacyWorkflowAlias: (workflow: any) => workflow,
}));

vi.mock("@/lib/workflows/completion", () => ({
  getWorkflowCompletionState: () => ({ status: "Draft" }),
}));

vi.mock("@/lib/ai/workflow-progress", () => ({
  evaluateWorkflowProgress: evaluateWorkflowProgressMock,
}));

vi.mock("@/lib/ai/parse-copilot-reply", () => ({
  parseCopilotReply: (content: string) => ({ displayText: content }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/db", () => ({
  db: {
    update: updateMock,
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: vi.fn().mockResolvedValue([{ workflowJson: createEmptyWorkflowSpec() }]),
        }),
      }),
    })),
  },
}));

describe("POST /api/automation-versions/[id]/copilot/chat analysis persistence", () => {
  const workflow = createEmptyWorkflowSpec();

  const detail = {
    version: {
      id: "version-1",
      tenantId: "tenant-1",
      automationId: "auto-1",
      status: "Draft",
      intakeNotes: "",
      workflowJson: workflow,
      updatedAt: new Date().toISOString(),
      versionLabel: "v1.0",
    },
    automation: { id: "auto-1" },
    workflowView: { workflowSpec: workflow },
    tasks: [],
  };

  const userMessage = {
    id: "user-1",
    tenantId: "tenant-1",
    automationVersionId: "version-1",
    role: "user" as const,
    content: "hello",
    createdBy: "user-99",
    createdAt: new Date().toISOString(),
  };

  const assistantMessage = {
    id: "assistant-1",
    tenantId: "tenant-1",
    automationVersionId: "version-1",
    role: "assistant" as const,
    content: "here you go",
    createdBy: null,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireTenantSessionMock.mockResolvedValue({ userId: "user-99", tenantId: "tenant-1", roles: ["editor"] });
    canMock.mockReturnValue(true);
    ensureRateLimitMock.mockReturnValue(true);
    getAutomationVersionDetailMock.mockResolvedValue(detail);
    listCopilotMessagesMock.mockResolvedValue([userMessage]);
    createCopilotMessageMock.mockImplementation(async (params: { role: "user" | "assistant"; content: string }) =>
      params.role === "user"
        ? { ...userMessage, id: "user-1", content: params.content }
        : { ...assistantMessage, content: params.content }
    );
    buildWorkflowFromChatMock.mockResolvedValue({
      workflow,
      tasks: [],
      chatResponse: "ok",
      followUpQuestion: "Is this daily?",
      sanitizationSummary: {},
      requirementsText: null,
    });
    syncAutomationTasksMock.mockResolvedValue({});
    evaluateWorkflowProgressMock.mockResolvedValue({ score: 0.5 });
    getCopilotAnalysisMock.mockResolvedValue(null);
    upsertCopilotAnalysisMock.mockResolvedValue({});
    determineConversationPhaseMock.mockReturnValue("drafting");
    generateThinkingStepsMock.mockReturnValue(["a"]);
    returningMock.mockResolvedValue([{ automationId: "auto-1", workflowJson: workflow }]);
    updateMock.mockReturnValue({ set: setMock });
    setMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ returning: returningMock });
  });

  it("persists analysis with stage, progress, asked questions and last message ids", async () => {
    const { POST } = await import("@/app/api/automation-versions/[id]/copilot/chat/route");
    const body = { content: "hello world", clientMessageId: "client-1" };
    const request = new Request("http://localhost/api/automation-versions/version-1/copilot/chat", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const response = await POST(request, { params: { id: "version-1" } });
    expect(response.status).toBe(200);

    expect(upsertCopilotAnalysisMock).toHaveBeenCalledTimes(1);
    const args = upsertCopilotAnalysisMock.mock.calls[0][0].analysis;

    expect(args.stage).toBeDefined();
    expect(args.question_count).toBeGreaterThanOrEqual(1);
    expect(args.asked_questions_normalized?.length).toBeGreaterThanOrEqual(1);
    expect(args.progress).toBeDefined();
    expect(args.lastUserMessageId).toBe("user-1");
    expect(args.lastAssistantMessageId).toBe("assistant-1");
  });

  it("treats analysis as stale when last_user_message_id mismatches and resets question count", async () => {
    getCopilotAnalysisMock.mockResolvedValue({
      memory: { summary_compact: null, facts: {}, question_count: 99, asked_questions_normalized: ["old"], stage: "done" },
      lastUserMessageId: "user-old",
      workflowUpdatedAt: new Date().toISOString(),
      stage: "done",
    });
    listCopilotMessagesMock.mockResolvedValue([userMessage]);

    const { POST } = await import("@/app/api/automation-versions/[id]/copilot/chat/route");
    const body = { content: "hello world", clientMessageId: "client-1" };
    const request = new Request("http://localhost/api/automation-versions/version-1/copilot/chat", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const response = await POST(request, { params: { id: "version-1" } });
    expect(response.status).toBe(200);
    const args = upsertCopilotAnalysisMock.mock.calls[0][0].analysis;
    expect(args.question_count).toBeLessThan(5);
    expect(args.lastUserMessageId).toBe("user-1");
  });

  it("treats analysis as stale when workflow_updated_at mismatches and refreshes", async () => {
    getCopilotAnalysisMock.mockResolvedValue({
      memory: { summary_compact: null, facts: {}, question_count: 5, asked_questions_normalized: ["old"], stage: "done" },
      lastUserMessageId: "user-1",
      workflowUpdatedAt: "2020-01-01T00:00:00.000Z",
      stage: "done",
    });
    listCopilotMessagesMock.mockResolvedValue([userMessage]);

    const { POST } = await import("@/app/api/automation-versions/[id]/copilot/chat/route");
    const body = { content: "hello world", clientMessageId: "client-1" };
    const request = new Request("http://localhost/api/automation-versions/version-1/copilot/chat", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const response = await POST(request, { params: { id: "version-1" } });
    expect(response.status).toBe(200);
    const args = upsertCopilotAnalysisMock.mock.calls[0][0].analysis;
    expect(args.workflowUpdatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    expect(args.lastUserMessageId).toBe("user-1");
  });
});

