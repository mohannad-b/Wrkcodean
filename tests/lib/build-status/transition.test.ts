import { describe, it, expect } from "vitest";
import { BUILD_STATUS_ORDER, canTransitionBuildStatus, BuildStatus } from "@/lib/build-status/types";

describe("canTransitionBuildStatus", () => {
  it("allows moving forward or staying on the same stage", () => {
    for (let index = 0; index < BUILD_STATUS_ORDER.length; index += 1) {
      const from = BUILD_STATUS_ORDER[index];
      expect(canTransitionBuildStatus(from, from)).toBe(true);

      for (let next = index; next < BUILD_STATUS_ORDER.length; next += 1) {
        const to = BUILD_STATUS_ORDER[next];
        expect(canTransitionBuildStatus(from, to)).toBe(true);
      }
    }
  });

  it("blocks backwards transitions", () => {
    const from: BuildStatus = "BuildInProgress";
    expect(canTransitionBuildStatus(from, "NeedsPricing")).toBe(false);
    expect(canTransitionBuildStatus("QATesting", "AwaitingClientApproval")).toBe(false);
  });

  it("returns false for unknown statuses", () => {
    expect(canTransitionBuildStatus("IntakeInProgress", "Paused" as BuildStatus)).toBe(false);
  });
});

