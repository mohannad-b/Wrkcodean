import { describe, it, expect } from "vitest";
import { canTransition, API_AUTOMATION_STATUSES, parseAutomationStatus } from "@/lib/automations/status";

describe("canTransition", () => {
  it("allows only adjacent forward transitions within the build pipeline", () => {
    expect(canTransition("IntakeInProgress", "NeedsPricing")).toBe(true);
    expect(canTransition("NeedsPricing", "AwaitingClientApproval")).toBe(true);
    expect(canTransition("AwaitingClientApproval", "ReadyForBuild")).toBe(true);
    expect(canTransition("ReadyForBuild", "BuildInProgress")).toBe(true);
    expect(canTransition("BuildInProgress", "QATesting")).toBe(true);
    expect(canTransition("QATesting", "Live")).toBe(true);
    expect(canTransition("Live", "Archived")).toBe(true);
  });

  it("blocks backwards or skipped transitions", () => {
    expect(canTransition("NeedsPricing", "IntakeInProgress")).toBe(false);
    expect(canTransition("NeedsPricing", "BuildInProgress")).toBe(false);
    expect(canTransition("BuildInProgress", "Live")).toBe(false);
    expect(canTransition("Archived", "Live")).toBe(false);
  });

  it("treats unchanged status as a no-op", () => {
    for (const status of API_AUTOMATION_STATUSES) {
      expect(canTransition(status, status)).toBe(true);
    }
  });
});

describe("parseAutomationStatus", () => {
  it("validates status strings", () => {
    for (const status of API_AUTOMATION_STATUSES) {
      expect(parseAutomationStatus(status)).toBe(status);
    }
    expect(parseAutomationStatus("LIVE")).toBe("Live");
    expect(parseAutomationStatus("Awaiting Approval")).toBe("AwaitingClientApproval");
    expect(parseAutomationStatus("unknown")).toBeNull();
  });
});


