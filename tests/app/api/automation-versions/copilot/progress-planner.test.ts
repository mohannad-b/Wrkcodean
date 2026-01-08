import { describe, expect, it } from "vitest";
import { ProgressPlanner } from "@/app/api/automation-versions/[id]/copilot/progress-planner";

const makePlanner = (opts?: { intent?: string; max?: number }) => {
  const events: any[] = [];
  const planner = new ProgressPlanner({
    runId: "run-1",
    requestId: "req-1",
    maxEmits: opts?.max,
    onEmit: (evt) => events.push(evt),
  });
  if (opts?.intent) planner.setIntentSummary(opts.intent);
  return { planner, events };
};

describe("ProgressPlanner", () => {
  it("intent emitted once", () => {
    const { planner, events } = makePlanner({ intent: "Updating workflow: scrape kayak…" });
    planner.emit("understanding");
    planner.emit("understanding");
    expect(events).toHaveLength(1);
    expect(events[0].message).toContain("Got it — Updating workflow: scrape kayak…");
  });

  it("semantic key dedupe", () => {
    const { planner, events } = makePlanner();
    planner.emit("understanding", "Setting schedule to daily at 8am", undefined, "schedule");
    planner.emit("understanding", "Setting schedule to daily at 8am", undefined, "schedule");
    expect(events).toHaveLength(1);
  });

  it("normalized text dedupe", () => {
    const { planner, events } = makePlanner();
    planner.emit("saving", "Saving...");
    planner.emit("saving", "Saving …");
    planner.emit("saving", "saving");
    expect(events).toHaveLength(1);
  });

  it("seq increments monotonically", () => {
    const { planner, events } = makePlanner();
    planner.emit("saving", "First");
    planner.emit("saving", "Second");
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("cap at max emits", () => {
    const { planner, events } = makePlanner({ max: 8 });
    for (let i = 0; i < 20; i++) {
      planner.emit("drafting", `msg-${i}`);
    }
    expect(events).toHaveLength(8);
  });

  it("does not emit connected bootstrap lines", () => {
    const { events } = makePlanner();
    const forbidden = events.find((e) => /connected/i.test(e.message));
    expect(forbidden).toBeUndefined();
  });
});

