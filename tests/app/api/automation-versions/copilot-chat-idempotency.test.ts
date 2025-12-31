import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyWorkflowSpec } from "@/lib/workflows/factory";
import { copilotMessages as copilotMessagesTable, tasks as tasksTable } from "@/db/schema";

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
const createCopilotRunMock = vi.fn();
const getCopilotRunByClientMessageIdMock = vi.fn();
const revalidatePathMock = vi.fn();

const returningMock = vi.fn();
const whereMock = vi.fn(() => ({ returning: returningMock }));
const setMock = vi.fn(() => ({ where: whereMock }));
const updateMock = vi.fn(() => ({ set: setMock }));

let selectTasksResult: unknown[] = [];
let selectCopilotMessagesResult: unknown[] = [];

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

vi.mock("@/lib/services/copilot-runs", () => ({
  getCopilotRunByClientMessageId: getCopilotRunByClientMessageIdMock,
  createCopilotRun: createCopilotRunMock,
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

vi.mock("@/lib/workflows/view-model", () => ({
  buildWorkflowViewModel: (workflow: any) => ({ workflowSpec: workflow }),
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

vi.mock("@/lib/services/copilot-analysis", () => ({
  getCopilotAnalysis: getCopilotAnalysisMock,
  upsertCopilotAnalysis: upsertCopilotAnalysisMock,
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
      from: (table: unknown) => ({
        where: vi.fn().mockResolvedValue(
          table === tasksTable
            ? selectTasksResult
            : table === copilotMessagesTable
            ? selectCopilotMessagesResult
            : []
        ),
      }),
    })),
  },
}));

describe("POST /api/automation-versions/[id]/copilot/chat idempotency", () => {
  const workflow = createEmptyWorkflowSpec();

  const baseDetail = {
    version: {
      id: "version-1",
      tenantId: "tenant-1",
      automationId: "auto-1",
      status: "Draft",
      intakeNotes: "notes",
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
    selectTasksResult = [];
    selectCopilotMessagesResult = [];
    requireTenantSessionMock.mockResolvedValue({ userId: "user-99", tenantId: "tenant-1", roles: ["editor"] });
    canMock.mockReturnValue(true);
    ensureRateLimitMock.mockReturnValue(true);
    getAutomationVersionDetailMock.mockResolvedValue(baseDetail);
    listCopilotMessagesMock.mockReset();
    listCopilotMessagesMock.mockResolvedValue([userMessage]);
    createCopilotMessageMock.mockImplementation(async (params: { role: "user" | "assistant"; content: string }) =>
      params.role === "user"
        ? { ...userMessage, content: params.content }
        : { ...assistantMessage, content: params.content }
    );
    buildWorkflowFromChatMock.mockResolvedValue({
      workflow,
      tasks: [],
      chatResponse: "ok",
      followUpQuestion: null,
      sanitizationSummary: {},
      requirementsText: null,
    });
    syncAutomationTasksMock.mockResolvedValue({});
    evaluateWorkflowProgressMock.mockResolvedValue({ score: 0.5 });
    getCopilotAnalysisMock.mockResolvedValue(null);
    upsertCopilotAnalysisMock.mockResolvedValue(undefined);
    determineConversationPhaseMock.mockReturnValue("drafting");
    generateThinkingStepsMock.mockReturnValue(["a"]);
    returningMock.mockResolvedValue([{ automationId: "auto-1", workflowJson: workflow }]);
    updateMock.mockReturnValue({ set: setMock });
    setMock.mockReturnValue({ where: whereMock });
    whereMock.mockReturnValue({ returning: returningMock });
    selectTasksResult = [];
    selectCopilotMessagesResult = [];
    createCopilotRunMock.mockResolvedValue({
      id: "run-1",
      tenantId: "tenant-1",
      automationVersionId: "version-1",
      clientMessageId: "client-1",
      userMessageId: "user-1",
      assistantMessageId: "assistant-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it("replays an existing run when the same clientMessageId is retried", async () => {
    getCopilotRunByClientMessageIdMock.mockResolvedValueOnce(null).mockResolvedValue({
      id: "run-1",
      tenantId: "tenant-1",
      automationVersionId: "version-1",
      clientMessageId: "client-1",
      userMessageId: "user-1",
      assistantMessageId: "assistant-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    listCopilotMessagesMock
      .mockResolvedValueOnce([userMessage])
      .mockResolvedValue([userMessage, assistantMessage]);
    selectCopilotMessagesResult = [assistantMessage];
    selectTasksResult = [];

    const { POST } = await import("@/app/api/automation-versions/[id]/copilot/chat/route");
    const body = { content: "hello world", clientMessageId: "client-1" };
    const request = new Request("http://localhost/api/automation-versions/version-1/copilot/chat", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const first = await POST(request, { params: { id: "version-1" } });
    const firstPayload = await first.json();

    const second = await POST(request, { params: { id: "version-1" } });
    const secondPayload = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firstPayload.message.id).toBe("assistant-1");
    expect(secondPayload.message.id).toBe("assistant-1");
    expect(createCopilotMessageMock).toHaveBeenCalledTimes(2); // user + assistant once
    expect(buildWorkflowFromChatMock).toHaveBeenCalledTimes(1);
    expect(syncAutomationTasksMock).toHaveBeenCalledTimes(1);
    expect(createCopilotRunMock).toHaveBeenCalledTimes(1);
  });

  it("returns a single run result even when two requests race", async () => {
    getCopilotRunByClientMessageIdMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "run-1",
        tenantId: "tenant-1",
        automationVersionId: "version-1",
        clientMessageId: "client-1",
        userMessageId: "user-1",
        assistantMessageId: "assistant-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    listCopilotMessagesMock
      .mockResolvedValueOnce([userMessage])
      .mockResolvedValue([userMessage, assistantMessage]);
    selectCopilotMessagesResult = [assistantMessage];
    selectTasksResult = [];

    const { POST } = await import("@/app/api/automation-versions/[id]/copilot/chat/route");
    const body = { content: "hello world", clientMessageId: "client-1" };

    const [first, second] = await Promise.all([
      POST(
        new Request("http://localhost/api/automation-versions/version-1/copilot/chat", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        { params: { id: "version-1" } }
      ),
      POST(
        new Request("http://localhost/api/automation-versions/version-1/copilot/chat", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        { params: { id: "version-1" } }
      ),
    ]);

    const payload1 = await first.json();
    const payload2 = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(payload1.message.id).toBe("assistant-1");
    expect(payload2.message.id).toBe("assistant-1");
    expect(getCopilotRunByClientMessageIdMock).toHaveBeenCalledTimes(2);
    expect(createCopilotRunMock.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

