import { describe, it, expect } from "vitest";
import { BlueprintSchema } from "@/lib/blueprint/schema";

const sections = [
  { id: "sec-1", key: "business_requirements", title: "Business Requirements", content: "Process overview" },
  { id: "sec-2", key: "business_objectives", title: "Business Objectives", content: "Shorten intake time" },
  { id: "sec-3", key: "success_criteria", title: "Success Criteria", content: "Submission < 2 min" },
  { id: "sec-4", key: "systems", title: "Systems", content: "HubSpot, Slack" },
  { id: "sec-5", key: "data_needs", title: "Data Needs", content: "Email, phone" },
  { id: "sec-6", key: "exceptions", title: "Exceptions", content: "High value deals" },
  { id: "sec-7", key: "human_touchpoints", title: "Human Touchpoints", content: "Sales approval" },
  { id: "sec-8", key: "flow_complete", title: "Flow Complete", content: "Hand off to CRM" },
];

const baseBlueprint = {
  version: 1,
  status: "Draft",
  summary: "Sync website leads into CRM with a Slack notification.",
  sections,
  steps: [
    {
      id: "step-1",
      type: "Trigger",
      name: "New lead submitted",
      summary: "Capture lead data from the website form.",
      description: "Capture lead data from the website form.",
      goalOutcome: "Start the workflow each time a lead submits the form.",
      responsibility: "Automated",
      systemsInvolved: ["HubSpot"],
      notifications: ["Slack"],
      nextStepIds: ["step-2"],
      timingSla: "Real-time",
      riskLevel: "Low",
      notesForOps: "Webhook already configured.",
      stepNumber: "",
      taskIds: [],
    },
    {
      id: "step-2",
      type: "Action",
      name: "Notify sales",
      summary: "Send the enriched lead to the #sales channel.",
      description: "Send the enriched lead to the #sales channel.",
      goalOutcome: "Ensure reps follow up within 24 hours.",
      responsibility: "Automated",
      systemsInvolved: ["Slack"],
      notifications: ["Slack"],
      nextStepIds: [],
      stepNumber: "",
      taskIds: [],
    },
  ],
  branches: [],
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

