import { describe, expect, it } from "vitest";
import {
  KANBAN_COLUMNS,
  SUBMISSION_STATUSES,
  applyTransition,
  canTransition,
  getColumnForStatus,
  getNextStatusForEvent,
  getStatusLabel,
  resolveStatus,
} from "@/lib/submissions/lifecycle";

describe("lifecycle kanban mapping", () => {
  it("maps every status to exactly one column", () => {
    const seen = new Set<string>();
    for (const status of SUBMISSION_STATUSES) {
      const column = getColumnForStatus(status);
      expect(column).not.toBeNull();
      expect(column?.statuses.includes(status)).toBe(true);
      const key = `${status}:${column?.id}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }

    const flattened = KANBAN_COLUMNS.flatMap((col) => col.statuses);
    expect(new Set(flattened).size).toBe(flattened.length);
  });
});

describe("lifecycle transitions", () => {
  it("validates adjacent forward moves", () => {
    expect(canTransition("IntakeInProgress", "NeedsPricing")).toBe(true);
    expect(canTransition("NeedsPricing", "AwaitingClientApproval")).toBe(true);
    expect(canTransition("AwaitingClientApproval", "ReadyForBuild")).toBe(true);
    expect(canTransition("ReadyForBuild", "BuildInProgress")).toBe(true);
    expect(canTransition("BuildInProgress", "QATesting")).toBe(true);
    expect(canTransition("QATesting", "Live")).toBe(true);
    expect(canTransition("Live", "Archived")).toBe(true);
  });

  it("rejects skipped steps", () => {
    expect(canTransition("NeedsPricing", "BuildInProgress")).toBe(false);
    expect(() => applyTransition({ from: "BuildInProgress", to: "Live", actorRole: "wrk_operator" })).toThrow();
  });

  it("returns null for events that do not apply to the current status", () => {
    expect(getNextStatusForEvent("qa.completed", "NeedsPricing")).toBeNull();
    expect(getNextStatusForEvent("quote.sent", "BuildInProgress")).toBeNull();
  });
});

describe("role-based permissions", () => {
  it("allows tenant roles to progress pricing and approvals only", () => {
    expect(
      applyTransition({ from: "NeedsPricing", to: "AwaitingClientApproval", actorRole: "tenant_admin" })
    ).toBe("AwaitingClientApproval");
    expect(() =>
      applyTransition({ from: "ReadyForBuild", to: "BuildInProgress", actorRole: "tenant_admin" })
    ).toThrow();
  });

  it("restricts archiving to elevated WRK roles", () => {
    expect(() => applyTransition({ from: "Live", to: "Archived", actorRole: "wrk_operator" })).toThrow();
    expect(applyTransition({ from: "Live", to: "Archived", actorRole: "wrk_admin" })).toBe("Archived");
  });
});

describe("legacy alias mapping", () => {
  it("maps legacy project status strings to canonical statuses", () => {
    expect(resolveStatus("Awaiting Approval")).toBe("AwaitingClientApproval");
    expect(resolveStatus("Ready to Launch")).toBe("ReadyForBuild");
    expect(resolveStatus("build in progress")).toBe("BuildInProgress");
  });

  it("returns labels for any canonical or aliased input", () => {
    expect(getStatusLabel("NeedsPricing")).toBe("Needs Pricing");
    expect(getStatusLabel("ready_to_build")).toBe("Ready for build");
  });
});

describe("event-driven transitions", () => {
  it('promotes "Sent" quotes into AwaitingClientApproval', () => {
    const next = getNextStatusForEvent("quote.sent", "NeedsPricing");
    expect(next).toBe("AwaitingClientApproval");
    expect(applyTransition({ from: "NeedsPricing", to: next!, actorRole: "wrk_operator" })).toBe(
      "AwaitingClientApproval"
    );
  });
});


