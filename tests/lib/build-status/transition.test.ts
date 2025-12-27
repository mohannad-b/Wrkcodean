import { describe, it, expect } from "vitest";
import { ACTIVE_LIFECYCLE_ORDER, canTransition, type SubmissionLifecycleStatus } from "@/lib/submissions/lifecycle";

describe("lifecycle adjacency", () => {
  it("allows staying on the same stage or moving forward by one step", () => {
    for (let index = 0; index < ACTIVE_LIFECYCLE_ORDER.length; index += 1) {
      const from = ACTIVE_LIFECYCLE_ORDER[index];
      expect(canTransition(from, from)).toBe(true);

      const next = ACTIVE_LIFECYCLE_ORDER[index + 1] as SubmissionLifecycleStatus | undefined;
      if (next) {
        expect(canTransition(from, next)).toBe(true);
      }
    }
  });

  it("blocks skipped or backwards transitions", () => {
    const from: SubmissionLifecycleStatus = "BuildInProgress";
    expect(canTransition(from, "NeedsPricing")).toBe(false);
    expect(canTransition("NeedsPricing", "BuildInProgress")).toBe(false);
    expect(canTransition("QATesting", "AwaitingClientApproval")).toBe(false);
  });
});
