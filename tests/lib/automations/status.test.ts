import { describe, it, expect } from "vitest";
import { canTransition, API_AUTOMATION_STATUSES, parseAutomationStatus } from "@/lib/automations/status";

const AUTOMATION_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["NEEDS_PRICING"],
  NEEDS_PRICING: ["READY_TO_BUILD"],
  READY_TO_BUILD: ["LIVE"],
  LIVE: ["ARCHIVED"],
  ARCHIVED: [],
};

describe("canTransition", () => {
  it("allows every defined valid transition", () => {
    for (const [from, allowed] of Object.entries(AUTOMATION_STATUS_TRANSITIONS)) {
      for (const to of allowed) {
        expect(canTransition(from as keyof typeof AUTOMATION_STATUS_TRANSITIONS, to)).toBe(true);
      }
    }
  });

  it("blocks transitions that skip required states", () => {
    expect(canTransition("DRAFT", "LIVE")).toBe(false);
    expect(canTransition("NEEDS_PRICING", "LIVE")).toBe(false);
    expect(canTransition("LIVE", "NEEDS_PRICING")).toBe(false);
    expect(canTransition("ARCHIVED", "NEEDS_PRICING")).toBe(false);
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
    expect(parseAutomationStatus("Unknown")).toBeNull();
  });
});


