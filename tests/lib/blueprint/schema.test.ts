import { describe, it, expect } from "vitest";
import { BlueprintSchema } from "@/lib/blueprint/schema";

const baseBlueprint = {
  version: 1,
  status: "Draft",
  goals: ["Reduce manual effort"],
  phases: [
    {
      id: "phase-1",
      name: "Discovery",
      order: 0,
      steps: [
        {
          id: "step-1",
          title: "Interview stakeholders",
          type: "Intake",
          description: "Capture objectives and constraints.",
          ownerRole: "CX Lead",
          estimateMinutes: 60,
          status: "Planned",
        },
      ],
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("BlueprintSchema", () => {
  it("accepts a valid blueprint payload", () => {
    expect(() => BlueprintSchema.parse(baseBlueprint)).not.toThrow();
  });

  it("rejects an invalid blueprint payload", () => {
    const invalid = { ...baseBlueprint, status: "Unknown" };
    expect(() => BlueprintSchema.parse(invalid)).toThrow();
  });
});

