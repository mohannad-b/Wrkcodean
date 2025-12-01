import { describe, it, expect } from "vitest";
import {
  canTransition,
  AUTOMATION_STATUSES,
  AUTOMATION_STATUS_TRANSITIONS,
  isAutomationStatus,
} from "@/lib/automations/status";

describe("canTransition", () => {
  it("allows every defined valid transition", () => {
    for (const [from, allowed] of Object.entries(AUTOMATION_STATUS_TRANSITIONS)) {
      for (const to of allowed) {
        expect(canTransition(from as keyof typeof AUTOMATION_STATUS_TRANSITIONS, to)).toBe(true);
      }
    }
  });

  it("blocks transitions that skip required states", () => {
    expect(canTransition("Intake", "Live")).toBe(false);
    expect(canTransition("Needs Pricing", "Live")).toBe(false);
    expect(canTransition("Live", "Needs Pricing")).toBe(false);
    expect(canTransition("Archived", "Needs Pricing")).toBe(false);
  });

  it("treats unchanged status as a no-op", () => {
    for (const status of AUTOMATION_STATUSES) {
      expect(canTransition(status, status)).toBe(true);
    }
  });
});

describe("isAutomationStatus", () => {
  it("validates status strings", () => {
    for (const status of AUTOMATION_STATUSES) {
      expect(isAutomationStatus(status)).toBe(true);
    }
    expect(isAutomationStatus("Unknown")).toBe(false);
  });
});


