import { describe, it, expect } from "vitest";
import { getAttentionTasks, type AutomationTask } from "@/lib/automations/tasks";

describe("getAttentionTasks", () => {
  const base: AutomationTask[] = [
    { id: "1", title: "Blocker open", description: null, status: "pending", priority: "blocker", metadata: null },
    { id: "2", title: "Important open", description: null, status: "in_progress", priority: "important", metadata: null },
    { id: "3", title: "Optional open", description: null, status: "pending", priority: "optional", metadata: null },
    { id: "4", title: "Blocker done", description: null, status: "complete", priority: "blocker", metadata: null },
  ];

  it("returns blockers and important tasks that are not complete", () => {
    const result = getAttentionTasks(base);
    expect(result.map((t) => t.id)).toEqual(["1", "2"]);
  });

  it("excludes optional tasks", () => {
    const result = getAttentionTasks(base);
    expect(result.find((t) => t.priority === "optional")).toBeUndefined();
  });

  it("excludes completed tasks", () => {
    const result = getAttentionTasks(base);
    expect(result.find((t) => t.id === "4")).toBeUndefined();
  });
});

