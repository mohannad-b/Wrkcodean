import { describe, it, expect } from "vitest";
import { AUTOMATION_TABS } from "@/lib/automations/tabs";

describe("automation detail tabs config", () => {
  it("matches the v1 tab order", () => {
    expect(AUTOMATION_TABS).toEqual(["Overview", "Build Status", "Workflow", "Activity", "Settings"]);
  });

  it("does not include hidden tabs", () => {
    expect(AUTOMATION_TABS).not.toContain("Test");
    expect(AUTOMATION_TABS).not.toContain("Contributors");
  });
});


