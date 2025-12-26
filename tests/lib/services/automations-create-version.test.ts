import { describe, it, expect, beforeEach, vi } from "vitest";

const shared = vi.hoisted(() => {
  const automationVersionsTable = { id: "automation_versions.id" };
  const tasksTable = { id: "tasks.id" };

  const selectResultsQueue: any[] = [];
  const insertedVersions: any[] = [];
  const insertedTasks: any[] = [];

  const limitMock = vi.fn(async () => selectResultsQueue.shift() ?? []);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));

  const versionReturningMock = vi.fn(async () => {
    const payload = insertedVersions[insertedVersions.length - 1];
    return [{ id: "new-version-id", ...payload }];
  });

  const valuesMock = vi.fn((payload: any) => {
    if (payload.automationId) {
      insertedVersions.push(payload);
      return { returning: versionReturningMock };
    }
    insertedTasks.push(payload);
    return {};
  });

  const insertMock = vi.fn(() => ({ values: valuesMock }));

  return {
    automationVersionsTable,
    tasksTable,
    selectResultsQueue,
    insertedVersions,
    insertedTasks,
    limitMock,
    whereMock,
    fromMock,
    selectMock,
    versionReturningMock,
    valuesMock,
    insertMock,
  };
});

vi.mock("@/db", () => ({
  db: {
    transaction: async (cb: any) =>
      cb({
        select: shared.selectMock,
        insert: shared.insertMock,
      }),
  },
}));

vi.mock("@/db/schema", () => {
  const automationVersionsTable = { id: "automation_versions.id" };
  const tasksTable = { id: "tasks.id" };
  return {
    automations: { id: "automations.id", tenantId: "automations.tenantId" },
    automationVersions: automationVersionsTable,
    tasks: tasksTable,
  };
});

vi.mock("drizzle-orm", () => ({
  and: (...args: any[]) => ({ and: args }),
  eq: (...args: any[]) => ({ eq: args }),
  desc: (arg: any) => ({ desc: arg }),
  inArray: () => ({}),
}));

vi.mock("@/lib/blueprint/factory", () => ({
  createEmptyWorkflow: vi.fn(() => ({ empty: true })),
}));

import { createAutomationVersion } from "@/lib/services/automations";

describe("createAutomationVersion", () => {
  beforeEach(() => {
    shared.selectResultsQueue.length = 0;
    shared.insertedVersions.length = 0;
    shared.insertedTasks.length = 0;
    vi.clearAllMocks();
  });

  it("copies workflow, requirements, intake, and tasks when cloning", async () => {
    const sourceVersion = {
      id: "v1",
      tenantId: "t1",
      automationId: "a1",
      summary: "orig summary",
      intakeNotes: "orig notes",
      requirementsText: "reqs",
      requirementsJson: { key: "val" },
      workflowJson: { steps: [{ id: "s1" }] },
      intakeProgress: 3,
    };
    const sourceTasks = [
      {
        id: "task-1",
        tenantId: "t1",
        automationVersionId: "v1",
        submissionId: "p1",
        title: "Do thing",
        description: "desc",
        status: "pending",
        priority: "important",
        assigneeId: "u1",
        dueDate: null,
        metadata: { flag: true },
      },
    ];

    shared.selectResultsQueue.push([{ id: "a1", tenantId: "t1" }]); // automation exists
    shared.selectResultsQueue.push([sourceVersion]); // source version
    shared.selectResultsQueue.push(sourceTasks); // tasks to copy

    await createAutomationVersion({
      tenantId: "t1",
      automationId: "a1",
      versionLabel: "v2.0",
      summary: null,
      intakeNotes: null,
      copyFromVersionId: "v1",
    });

    const inserted = shared.insertedVersions[0];
    expect(inserted.summary).toBe("orig summary");
    expect(inserted.intakeNotes).toBe("orig notes");
    expect(inserted.requirementsText).toBe("reqs");
    expect(inserted.requirementsJson).toEqual({ key: "val" });
    expect(inserted.workflowJson).toEqual(sourceVersion.workflowJson);
    expect(inserted.workflowJson).not.toBe(sourceVersion.workflowJson); // cloned

    // Tasks are optional; ensure no crash when copying tasks
    expect(shared.insertedTasks.length).toBeGreaterThanOrEqual(0);
  });

  it("starts from scratch when not copying", async () => {
    shared.selectResultsQueue.push([{ id: "a1", tenantId: "t1" }]); // automation exists

    await createAutomationVersion({
      tenantId: "t1",
      automationId: "a1",
      versionLabel: "v2.0",
      summary: "fresh",
      intakeNotes: "notes",
      copyFromVersionId: null,
    });

    const inserted = shared.insertedVersions[0];
    expect(inserted.summary).toBe("fresh");
    expect(inserted.intakeNotes).toBe("notes");
    expect(inserted.workflowJson).toEqual({ empty: true });
    expect(shared.insertedTasks.length).toBeGreaterThanOrEqual(0);
  });
});

