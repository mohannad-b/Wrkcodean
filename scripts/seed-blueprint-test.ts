import * as dotenv from "dotenv";
import { and, eq } from "drizzle-orm";

import { db, pool } from "../db";
import { automationVersions, automations, memberships, tasks, tenants, users } from "../db/schema";
import { createEmptyBlueprint } from "../lib/blueprint/factory";
import type { Blueprint, BlueprintStep } from "../lib/blueprint/types";

dotenv.config({ path: ".env.local" });

const TEST_TENANT_SLUG = "test-company";
const TEST_AUTOMATION_NAME = "Invoice Processing Automation";
const VERSION_LABEL = "Blueprint Test";

type TaskSeed = {
  title: string;
  description: string;
  priority: "blocker" | "important" | "optional";
  systemType?: string;
  relatedSteps: string[];
};

const TASK_SEEDS: TaskSeed[] = [
  {
    title: "Provide Gmail OAuth access",
    description: "Grant WRK access to invoices@company.com so we can ingest invoice emails automatically.",
    priority: "blocker",
    systemType: "gmail",
    relatedSteps: ["1"],
  },
  {
    title: "Provide sample invoice PDFs",
    description: "Upload at least 3 recent invoice PDFs so we can train the parser.",
    priority: "blocker",
    systemType: "pdf",
    relatedSteps: ["2"],
  },
  {
    title: "Provide Slack approver handles",
    description: "Share the Slack handles for finance managers who should approve invoices over $1000.",
    priority: "blocker",
    systemType: "slack",
    relatedSteps: ["3A"],
  },
  {
    title: "Provide Jira API credentials",
    description: "Create a Jira API key with permission to create issues in the Finance project.",
    priority: "blocker",
    systemType: "jira",
    relatedSteps: ["4"],
  },
  {
    title: "Share finance escalation channel",
    description: "Confirm which Slack channel should receive exception alerts when parsing fails.",
    priority: "important",
    systemType: "slack",
    relatedSteps: ["2E"],
  },
];

async function ensureTenant() {
  const existing = await db.query.tenants.findFirst({
    where: eq(tenants.slug, TEST_TENANT_SLUG),
  });

  if (existing) {
    return existing;
  }

  const [tenant] = await db
    .insert(tenants)
    .values({
      name: "Test Company",
      slug: TEST_TENANT_SLUG,
    })
    .returning();

  if (!tenant) {
    throw new Error("Failed to create test tenant");
  }

  return tenant;
}

async function ensureUser() {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, "test@example.com"),
  });

  if (existing) {
    return existing;
  }

  const [user] = await db
    .insert(users)
    .values({
      email: "test@example.com",
      name: "Test User",
    })
    .returning();

  if (!user) {
    throw new Error("Failed to create test user");
  }

  return user;
}

async function ensureAutomation(tenantId: string, createdBy: string) {
  const existing = await db.query.automations.findFirst({
    where: and(eq(automations.tenantId, tenantId), eq(automations.name, TEST_AUTOMATION_NAME)),
  });

  if (existing) {
    return existing;
  }

  const [automation] = await db
    .insert(automations)
    .values({
      tenantId,
      name: TEST_AUTOMATION_NAME,
      description: "Automated invoice processing with conditional approvals and exception handling",
      createdBy,
    })
    .returning();

  if (!automation) {
    throw new Error("Failed to create test automation");
  }

  return automation;
}

async function ensureMembershipRecord(tenantId: string, userId: string) {
  const existing = await db.query.memberships.findFirst({
    where: and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId)),
  });

  if (existing) {
    return existing;
  }

  const [membership] = await db.insert(memberships).values({
    tenantId,
    userId,
    role: "client_admin",
  }).returning();

  return membership;
}

function buildTestBlueprint(): Blueprint {
  const base = createEmptyBlueprint();
  const now = new Date().toISOString();

  const sections = base.sections.map((section) => {
    switch (section.key) {
      case "business_requirements":
        return {
          ...section,
          content: "Automate invoice intake, data extraction, conditional approvals, and downstream posting.",
        };
      case "business_objectives":
        return {
          ...section,
          content: "Reduce manual entry time by 80% and provide real-time visibility into invoice approvals.",
        };
      case "success_criteria":
        return {
          ...section,
          content: "Invoices under $1000 auto-posted within 2 minutes. Exceptions resolved within 4 business hours.",
        };
      case "systems":
        return {
          ...section,
          content: "Gmail, PDF Parser, Slack, Jira.",
        };
      case "data_needs":
        return {
          ...section,
          content: "Invoice number, vendor, amount, due date, Slack contact list, Jira project.",
        };
      case "exceptions":
        return {
          ...section,
          content: "Parsing failures escalate to Slack and hold the invoice in Jira with Exception tag.",
        };
      case "human_touchpoints":
        return {
          ...section,
          content: "Manager approvals for invoices above $1000.",
        };
      case "flow_complete":
        return {
          ...section,
          content: "Jira ticket created with status Ready for Payment and stakeholders notified.",
        };
      default:
        return section;
    }
  });

  const steps: BlueprintStep[] = [
    {
      id: "step-001",
      stepNumber: "1",
      type: "Trigger",
      name: "Invoice arrives in email",
      description: "When a new email arrives in invoices@company.com with a PDF attachment.",
      summary: "Email trigger monitors invoices inbox.",
      goalOutcome: "Capture every incoming invoice email.",
      responsibility: "Automated",
      systemsInvolved: ["gmail"],
      notifications: [],
      nextStepIds: ["step-002"],
      taskIds: [],
    },
    {
      id: "step-002",
      stepNumber: "2",
      type: "Action",
      name: "Extract invoice data",
      description: "Parse PDF to extract invoice number, vendor, amount, and due date.",
      summary: "PDF parsing extracts key invoice details.",
      goalOutcome: "Produce structured invoice data for routing.",
      responsibility: "Automated",
      systemsInvolved: ["pdf_parser"],
      notifications: [],
      notesExceptions: "If parsing fails, send to exception handler.",
      nextStepIds: ["step-003", "step-002e"],
      taskIds: [],
    },
    {
      id: "step-002e",
      stepNumber: "2E",
      type: "Exception",
      name: "Handle parsing failure",
      description: "Alert finance ops in Slack and request manual review.",
      summary: "Escalate parsing issues to humans.",
      goalOutcome: "Ensure failed invoices are reviewed promptly.",
      responsibility: "HumanReview",
      systemsInvolved: ["slack"],
      notifications: ["slack"],
      parentStepId: "step-002",
      branchType: "exception",
      branchLabel: "Exception",
      nextStepIds: [],
      taskIds: [],
    },
    {
      id: "step-003",
      stepNumber: "3",
      type: "Decision",
      name: "Check invoice amount",
      description: "Compare invoice total to $1000 threshold.",
      summary: "Branch by approval requirement.",
      goalOutcome: "Route invoices to correct approval path.",
      responsibility: "Automated",
      systemsInvolved: [],
      notifications: [],
      branchType: "conditional",
      branchCondition: "Amount > $1000",
      nextStepIds: ["step-003a", "step-003b"],
      taskIds: [],
    },
    {
      id: "step-003a",
      stepNumber: "3A",
      type: "Human",
      name: "Manager approval",
      description: "Notify finance manager in Slack for approval.",
      summary: "Manager reviews high-value invoices.",
      goalOutcome: "Approved or rejected decision recorded.",
      responsibility: "Approval",
      systemsInvolved: ["slack"],
      notifications: ["slack"],
      branchLabel: "Yes",
      parentStepId: "step-003",
      nextStepIds: ["step-004"],
      taskIds: [],
    },
    {
      id: "step-003b",
      stepNumber: "3B",
      type: "Action",
      name: "Auto-approve invoice",
      description: "Invoices at or below $1000 auto-approved.",
      summary: "Bypass manual approval for low amounts.",
      goalOutcome: "Automatically approved invoice routed downstream.",
      responsibility: "Automated",
      systemsInvolved: [],
      notifications: [],
      branchLabel: "No",
      parentStepId: "step-003",
      nextStepIds: ["step-004"],
      taskIds: [],
    },
    {
      id: "step-004",
      stepNumber: "4",
      type: "Action",
      name: "Create Jira ticket",
      description: "Create Jira issue with invoice metadata and approval outcome.",
      summary: "Ticket created for downstream payment.",
      goalOutcome: "Finance ops has a single work item per invoice.",
      responsibility: "Automated",
      systemsInvolved: ["jira"],
      notifications: ["slack"],
      nextStepIds: [],
      taskIds: [],
    },
  ];

  const branches = [
    {
      id: "branch-001",
      parentStepId: "step-003",
      condition: "Amount > $1000",
      label: "Yes",
      targetStepId: "step-003a",
    },
    {
      id: "branch-002",
      parentStepId: "step-003",
      condition: "Amount <= $1000",
      label: "No",
      targetStepId: "step-003b",
    },
    {
      id: "branch-003",
      parentStepId: "step-002",
      condition: "Parsing failure",
      label: "Exception",
      targetStepId: "step-002e",
    },
  ];

  return {
    ...base,
    summary: "Process invoice emails, extract details, and route approvals with Slack + Jira handoffs.",
    sections,
    steps,
    branches,
    createdAt: now,
    updatedAt: now,
  };
}

async function insertTaskSeeds({
  tenantId,
  automationVersionId,
  blueprint,
}: {
  tenantId: string;
  automationVersionId: string;
  blueprint: Blueprint;
}): Promise<Record<string, string[]>> {
  const assignments: Record<string, string[]> = {};
  const stepIdByNumber = new Map<string, string>();
  blueprint.steps.forEach((step) => {
    if (step.stepNumber) {
      stepIdByNumber.set(step.stepNumber, step.id);
    }
  });

  for (const seed of TASK_SEEDS) {
    const [task] = await db
      .insert(tasks)
      .values({
        tenantId,
        automationVersionId,
        title: seed.title,
        description: seed.description,
        status: "pending",
        priority: seed.priority,
        metadata: {
          systemType: seed.systemType,
          relatedSteps: seed.relatedSteps,
          isBlocker: seed.priority === "blocker",
        },
      })
      .returning();

    if (!task) {
      continue;
    }

    const relatedStepIds = seed.relatedSteps
      .map((stepNumber) => stepIdByNumber.get(stepNumber))
      .filter((value): value is string => Boolean(value));

    relatedStepIds.forEach((stepId) => {
      if (!assignments[stepId]) {
        assignments[stepId] = [];
      }
      assignments[stepId].push(task.id);
    });
  }

  return assignments;
}

async function seed() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to run the seed script.");
  }

  console.log("🌱 Starting blueprint test data seed...");

  const tenant = await ensureTenant();
  const user = await ensureUser();
  await ensureMembershipRecord(tenant.id, user.id);
  const automation = await ensureAutomation(tenant.id, user.id);

  console.log(`🤖 Automation ready: ${automation.name}`);

  // Remove existing version with same label for repeatability
  await db
    .delete(automationVersions)
    .where(
      and(
        eq(automationVersions.tenantId, tenant.id),
        eq(automationVersions.automationId, automation.id),
        eq(automationVersions.versionLabel, VERSION_LABEL)
      )
    );

  const blueprint = buildTestBlueprint();

  const [version] = await db
    .insert(automationVersions)
    .values({
      tenantId: tenant.id,
      automationId: automation.id,
      versionLabel: VERSION_LABEL,
      status: "IntakeInProgress",
      summary: blueprint.summary,
      blueprintJson: blueprint,
      intakeProgress: 80,
    })
    .returning();

  if (!version) {
    throw new Error("Failed to insert automation version");
  }

  const taskAssignments = await insertTaskSeeds({
    tenantId: tenant.id,
    automationVersionId: version.id,
    blueprint,
  });

  const blueprintWithTasks: Blueprint = {
    ...blueprint,
    steps: blueprint.steps.map((step) => ({
      ...step,
      taskIds: taskAssignments[step.id] ?? [],
    })),
  };

  await db
    .update(automationVersions)
    .set({ blueprintJson: blueprintWithTasks })
    .where(eq(automationVersions.id, version.id));

  console.log("✅ Test blueprint seeded!");
  console.log(`
📊 Summary
──────────
Steps: ${blueprintWithTasks.steps.length}
Branches: ${blueprintWithTasks.branches.length}
Tasks: ${TASK_SEEDS.length} total (${TASK_SEEDS.filter((task) => task.priority === "blocker").length} blockers)

🎯 Next:
  1. Open Studio and load "${automation.name}"
  2. Verify step numbers 1, 2, 2E, 3, 3A, 3B, 4
  3. Confirm decision node styling and branch labels
  4. Review the Tasks tab and mark blockers as complete
`);
}

seed()
  .then(() => {
    console.log("✅ Blueprint seed complete");
  })
  .catch((error) => {
    console.error("❌ Seed failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

