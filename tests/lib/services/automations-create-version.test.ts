import { describe, it, expect, beforeEach, vi } from "vitest";

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

const insertMock = vi.fn((table) => ({ values: valuesMock }));

vi.mock("@/db", () => ({
  db: {
    transaction: async (cb: any) =>
      cb({
        select: selectMock,
        insert: insertMock,
      }),
  },
}));

vi.mock("@/db/schema", () => ({
  automations: { id: "automations.id", tenantId: "automations.tenantId" },
  automationVersions: automationVersionsTable,
  tasks: tasksTable,
}));

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
    selectResultsQueue.length = 0;
    insertedVersions.length = 0;
    insertedTasks.length = 0;
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
        projectId: "p1",
        title: "Do thing",
        description: "desc",
        status: "pending",
        priority: "important",
        assigneeId: "u1",
        dueDate: null,
        metadata: { flag: true },
      },
    ];

    selectResultsQueue.push([{ id: "a1", tenantId: "t1" }]); // automation exists
    selectResultsQueue.push([sourceVersion]); // source version
    selectResultsQueue.push(sourceTasks); // tasks to copy

    await createAutomationVersion({
      tenantId: "t1",
      automationId: "a1",
      versionLabel: "v2.0",
      summary: null,
      intakeNotes: null,
      copyFromVersionId: "v1",
    });

    const inserted = insertedVersions[0];
    expect(inserted.summary).toBe("orig summary");
    expect(inserted.intakeNotes).toBe("orig notes");
    expect(inserted.requirementsText).toBe("reqs");
    expect(inserted.requirementsJson).toEqual({ key: "val" });
    expect(inserted.workflowJson).toEqual(sourceVersion.workflowJson);
    expect(inserted.workflowJson).not.toBe(sourceVersion.workflowJson); // cloned

    expect(insertedTasks).toHaveLength(1);
    expect(insertedTasks[0].automationVersionId).toBe("new-version-id");
    expect(insertedTasks[0].tenantId).toBe("t1");
    expect(insertedTasks[0].title).toBe("Do thing");
  });

  it("starts from scratch when not copying", async () => {
    selectResultsQueue.push([{ id: "a1", tenantId: "t1" }]); // automation exists

    await createAutomationVersion({
      tenantId: "t1",
      automationId: "a1",
      versionLabel: "v2.0",
      summary: "fresh",
      intakeNotes: "notes",
      copyFromVersionId: null,
    });

    const inserted = insertedVersions[0];
    expect(inserted.summary).toBe("fresh");
    expect(inserted.intakeNotes).toBe("notes");
    expect(inserted.workflowJson).toEqual({ empty: true });
    expect(insertedTasks).toHaveLength(0);
  });
});

