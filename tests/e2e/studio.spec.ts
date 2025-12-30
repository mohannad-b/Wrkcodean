import { expect, test, type Page } from "@playwright/test";

const automationId = "studio-fixture";
const versionId = "studio-version";

const baseWorkflow = {
  version: 1,
  status: "IntakeInProgress",
  summary: "",
  sections: [],
  steps: [
    {
      id: "step-1",
      type: "Trigger",
      name: "Start intake",
      summary: "Kick off workflow",
      description: "Start the intake flow",
      goalOutcome: "Begin",
      responsibility: "Automated",
      notesExceptions: "",
      systemsInvolved: [],
      timingSla: "",
      riskLevel: "Low",
      notifications: [],
      nextStepIds: ["step-2"],
      stepNumber: "",
      taskIds: [],
    },
    {
      id: "step-2",
      type: "Decision",
      name: "Check amount",
      summary: "Decision point",
      description: "Route based on amount",
      goalOutcome: "Choose branch",
      responsibility: "Automated",
      notesExceptions: "",
      systemsInvolved: [],
      timingSla: "",
      riskLevel: "Low",
      notifications: [],
      nextStepIds: ["step-3", "step-4"],
      stepNumber: "",
      taskIds: [],
    },
    {
      id: "step-3",
      type: "Action",
      name: "Auto approve",
      summary: "Approve automatically",
      description: "Auto approve small amounts",
      goalOutcome: "Approve quickly",
      responsibility: "Automated",
      notesExceptions: "",
      systemsInvolved: [],
      timingSla: "",
      riskLevel: "Low",
      notifications: [],
      nextStepIds: [],
      stepNumber: "",
      taskIds: [],
      parentStepId: "step-2",
      branchLabel: "Approve",
      branchCondition: "Amount <= 1000",
    },
    {
      id: "step-4",
      type: "Human",
      name: "Manual review",
      summary: "Manual review",
      description: "Escalate high amounts",
      goalOutcome: "Human review",
      responsibility: "HumanReview",
      notesExceptions: "",
      systemsInvolved: [],
      timingSla: "",
      riskLevel: "Medium",
      notifications: [],
      nextStepIds: [],
      stepNumber: "",
      taskIds: [],
      parentStepId: "step-2",
      branchLabel: "Escalate",
      branchCondition: "Amount > 1000",
    },
  ],
  branches: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  metadata: { nodePositions: {} },
};

async function mockStudio(page: Page) {
  let currentWorkflow = JSON.parse(JSON.stringify(baseWorkflow));

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === `/api/automations/${automationId}`) {
      return route.fulfill({
        json: {
          automation: {
            id: automationId,
            name: "Studio Fixture",
            description: "Fixture automation for e2e",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            versions: [
              {
                id: versionId,
                versionLabel: "v1",
                status: "IntakeInProgress",
                intakeNotes: "",
                requirementsText: "",
                workflowJson: currentWorkflow,
                summary: "",
                businessOwner: null,
                tags: [],
                latestQuote: null,
                latestMetrics: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                tasks: [],
              },
            ],
          },
        },
      });
    }

    if (url.pathname === `/api/automation-versions/${versionId}` && route.request().method() === "PATCH") {
      try {
        const body = route.request().postDataJSON();
        if (body?.workflowJson) {
          currentWorkflow = body.workflowJson;
        }
      } catch {
        // ignore parsing errors in tests
      }
      return route.fulfill({ json: { ok: true } });
    }

    if (url.pathname === `/api/automation-versions/${versionId}/messages`) {
      return route.fulfill({ json: { messages: [] } });
    }

    if (url.pathname === `/api/automation-versions/${versionId}/metrics`) {
      return route.fulfill({ json: { latestMetric: null, config: null } });
    }

    if (url.pathname.startsWith(`/api/automation-versions/${versionId}/activity`)) {
      return route.fulfill({ json: { activities: [] } });
    }

    return route.fulfill({ json: {} });
  });
}

test.describe("Studio", () => {
  test("renders shell and opens edge inspector", async ({ page }) => {
    await mockStudio(page);

    await page.goto(`/automations/${automationId}?tab=Workflow`);

    await expect(page.getByTestId("save-indicator")).toBeVisible();
    await expect(page.getByTestId("canvas-pane")).toBeVisible();
    await expect(page.getByText(/help you design your automation/i)).toBeVisible();
    await expect(page.getByTestId("edge-inspector")).toBeVisible();

    await page.getByText("Approve").click();
    await expect(page.getByTestId("edge-inspector")).toContainText("Approve");
  });
});

