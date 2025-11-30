/**
 * WRK Copilot Database Schema (Drizzle ORM)
 * 
 * This schema defines the core database tables for the WRK Copilot backend.
 * All multi-tenant tables include `tenant_id` for data isolation.
 * 
 * Domain modules:
 * - Identity & Access: tenants, users, api_keys, sessions
 * - Automations & Versions: automations, automation_versions
 * - Execution & Integrations: workflow_bindings, run_events, usage_aggregates
 * - Pricing & Billing: quotes, pricing_overrides, billing_periods
 * - Admin & Ops: clients, projects
 * - Collaboration & Observability: messages, tasks, audit_logs
 */

import { pgTable, uuid, text, timestamp, jsonb, integer, numeric, date, pgEnum, unique, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// Identity & Access Module
// ============================================================================

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  subdomain: text("subdomain").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    avatarUrl: text("avatar_url"),
    passwordHash: text("password_hash"), // nullable if SSO-only
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantEmailUnique: unique("users_tenant_email_unique").on(table.tenantId, table.email),
    tenantIdIdx: index("idx_users_tenant_id").on(table.tenantId),
  })
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    keyHash: text("key_hash").notNull(), // hashed, never plaintext
    name: text("name").notNull(), // user-friendly name
    permissions: jsonb("permissions").$type<string[]>(), // array of allowed operations
    expiresAt: timestamp("expires_at", { withTimezone: true }), // nullable for no expiration
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table) => ({
    tenantIdIdx: index("idx_api_keys_tenant_id").on(table.tenantId),
  })
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    refreshToken: text("refresh_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("idx_sessions_user_id").on(table.userId),
    tenantIdIdx: index("idx_sessions_tenant_id").on(table.tenantId),
  })
);

// ============================================================================
// Automations & Versions Module
// ============================================================================

export const automationStatusEnum = pgEnum("automation_status", [
  "Intake in Progress",
  "Needs Pricing",
  "Awaiting Client Approval",
  "Build in Progress",
  "QA & Testing",
  "Ready to Launch",
  "Live",
  "Blocked",
  "Archived",
]);

export const automations = pgTable(
  "automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    name: text("name").notNull(),
    description: text("description"),
    department: text("department"),
    ownerId: uuid("owner_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdIdx: index("idx_automations_tenant_id").on(table.tenantId),
  })
);

export const automationVersions = pgTable(
  "automation_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    automationId: uuid("automation_id").notNull().references(() => automations.id),
    version: text("version").notNull(), // semver: v1.0, v1.1, v2.0
    status: automationStatusEnum("status").notNull(),
    blueprintJson: jsonb("blueprint_json").notNull(), // stores nodes and edges as JSON
    intakeProgress: integer("intake_progress").default(0), // 0-100
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    automationVersionUnique: unique("automation_versions_automation_version_unique").on(
      table.automationId,
      table.version
    ),
    tenantIdIdx: index("idx_automation_versions_tenant_id").on(table.tenantId),
    automationIdIdx: index("idx_automation_versions_automation_id").on(table.automationId),
    statusIdx: index("idx_automation_versions_status").on(table.status),
  })
);

// ============================================================================
// Execution & Integrations Module
// ============================================================================

export const workflowBindingStatusEnum = pgEnum("workflow_binding_status", [
  "active",
  "inactive",
  "error",
]);

export const workflowBindings = pgTable(
  "workflow_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    automationVersionId: uuid("automation_version_id").notNull().references(() => automationVersions.id),
    wrkWorkflowId: text("wrk_workflow_id").notNull(),
    wrkWorkflowUrl: text("wrk_workflow_url"),
    status: workflowBindingStatusEnum("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdIdx: index("idx_workflow_bindings_tenant_id").on(table.tenantId),
    automationVersionIdIdx: index("idx_workflow_bindings_automation_version_id").on(
      table.automationVersionId
    ),
  })
);

export const runEventStatusEnum = pgEnum("run_event_status", ["success", "failure"]);

export const runEvents = pgTable(
  "run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    workflowBindingId: uuid("workflow_binding_id").notNull().references(() => workflowBindings.id),
    runId: text("run_id").notNull(), // from Wrk platform
    status: runEventStatusEnum("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Idempotency: prevent duplicate processing of the same run
    workflowBindingRunIdUnique: unique("run_events_workflow_binding_run_id_unique").on(
      table.workflowBindingId,
      table.runId
    ),
    tenantIdIdx: index("idx_run_events_tenant_id").on(table.tenantId),
    workflowBindingIdIdx: index("idx_run_events_workflow_binding_id").on(table.workflowBindingId),
    startedAtIdx: index("idx_run_events_started_at").on(table.startedAt),
  })
);

export const usageAggregates = pgTable(
  "usage_aggregates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    automationVersionId: uuid("automation_version_id").notNull().references(() => automationVersions.id),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    runCount: integer("run_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    totalCost: numeric("total_cost", { precision: 12, scale: 4 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Unique aggregate per version per time period
    automationVersionPeriodUnique: unique("usage_aggregates_automation_version_period_unique").on(
      table.automationVersionId,
      table.periodStart,
      table.periodEnd
    ),
    tenantIdIdx: index("idx_usage_aggregates_tenant_id").on(table.tenantId),
    automationVersionIdIdx: index("idx_usage_aggregates_automation_version_id").on(
      table.automationVersionId
    ),
    periodIdx: index("idx_usage_aggregates_period").on(table.periodStart, table.periodEnd),
  })
);

// ============================================================================
// Pricing & Billing Module
// ============================================================================

export const quoteStatusEnum = pgEnum("quote_status", ["draft", "sent", "signed", "rejected"]);

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    automationVersionId: uuid("automation_version_id").notNull().references(() => automationVersions.id),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    status: quoteStatusEnum("status").notNull(),
    setupFee: numeric("setup_fee", { precision: 10, scale: 2 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 4 }).notNull(),
    estimatedVolume: integer("estimated_volume"),
    effectiveUnitPrice: numeric("effective_unit_price", { precision: 10, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    signedAt: timestamp("signed_at", { withTimezone: true }),
  },
  (table) => ({
    tenantIdIdx: index("idx_quotes_tenant_id").on(table.tenantId),
    automationVersionIdIdx: index("idx_quotes_automation_version_id").on(table.automationVersionId),
  })
);

export const pricingOverrides = pgTable("pricing_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  automationVersionId: uuid("automation_version_id").notNull().references(() => automationVersions.id),
  setupFeeOverride: numeric("setup_fee_override", { precision: 10, scale: 2 }),
  unitPriceOverride: numeric("unit_price_override", { precision: 10, scale: 4 }),
  reason: text("reason"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const billingPeriods = pgTable(
  "billing_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    totalSpend: numeric("total_spend", { precision: 12, scale: 2 }).notNull(),
    setupFeesCollected: numeric("setup_fees_collected", { precision: 12, scale: 2 }).notNull(),
    unitCosts: numeric("unit_costs", { precision: 12, scale: 2 }).notNull(),
    status: text("status").notNull(), // draft/finalized
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  },
  (table) => ({
    tenantIdIdx: index("idx_billing_periods_tenant_id").on(table.tenantId),
  })
);

// ============================================================================
// Admin & Ops Module
// ============================================================================

export const clientHealthStatusEnum = pgEnum("client_health_status", [
  "Good",
  "At Risk",
  "Churn Risk",
]);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().unique().references(() => tenants.id), // 1:1 with tenants
    name: text("name").notNull(),
    industry: text("industry"),
    healthStatus: clientHealthStatusEnum("health_status"),
    ownerId: uuid("owner_id").references(() => users.id), // ops team member
    committedMonthlySpend: numeric("committed_monthly_spend", { precision: 12, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdIdx: index("idx_clients_tenant_id").on(table.tenantId),
  })
);

export const projectTypeEnum = pgEnum("project_type", ["new_automation", "revision"]);

export const pricingStatusEnum = pgEnum("pricing_status", [
  "Not Generated",
  "Draft",
  "Sent",
  "Signed",
]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    automationId: uuid("automation_id").references(() => automations.id), // nullable
    automationVersionId: uuid("automation_version_id").references(() => automationVersions.id), // nullable
    name: text("name").notNull(),
    type: projectTypeEnum("type").notNull(),
    status: automationStatusEnum("status").notNull(), // aligns with automation_version.status
    pricingStatus: pricingStatusEnum("pricing_status"),
    ownerId: uuid("owner_id").references(() => users.id),
    eta: date("eta"),
    checklistProgress: integer("checklist_progress").default(0), // calculated from tasks
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdIdx: index("idx_projects_tenant_id").on(table.tenantId),
    clientIdIdx: index("idx_projects_client_id").on(table.clientId),
    statusIdx: index("idx_projects_status").on(table.status),
  })
);

// ============================================================================
// Collaboration & Observability Module
// ============================================================================

export const messageTypeEnum = pgEnum("message_type", ["client", "ops", "internal_note"]);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    projectId: uuid("project_id").references(() => projects.id), // nullable
    automationVersionId: uuid("automation_version_id").references(() => automationVersions.id), // nullable
    type: messageTypeEnum("type").notNull(),
    senderId: uuid("sender_id").notNull().references(() => users.id),
    text: text("text").notNull(),
    attachmentsJson: jsonb("attachments_json"),
    tags: text("tags").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdIdx: index("idx_messages_tenant_id").on(table.tenantId),
    projectIdIdx: index("idx_messages_project_id").on(table.projectId),
  })
);

export const taskContextTypeEnum = pgEnum("task_context_type", [
  "project",
  "automation_version",
  "internal",
]);

export const taskKindEnum = pgEnum("task_kind", ["build_checklist", "general_todo", "workflow_item"]);

export const taskStatusEnum = pgEnum("task_status", ["pending", "in_progress", "complete"]);

export const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high", "critical"]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    contextType: taskContextTypeEnum("context_type").notNull(), // project/automation_version/internal
    contextId: uuid("context_id"), // FK to project/automation_version, nullable for internal tasks
    kind: taskKindEnum("kind").notNull(), // build_checklist/general_todo/workflow_item
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull(),
    assigneeId: uuid("assignee_id").references(() => users.id),
    dueDate: date("due_date"),
    priority: taskPriorityEnum("priority"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdIdx: index("idx_tasks_tenant_id").on(table.tenantId),
    contextIdx: index("idx_tasks_context").on(table.contextType, table.contextId),
  })
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    actionType: text("action_type").notNull(), // create/update/delete/approve/reject
    resourceType: text("resource_type").notNull(), // automation/quote/project/etc
    resourceId: uuid("resource_id").notNull(),
    changesJson: jsonb("changes_json"), // before/after snapshot
    ipAddress: text("ip_address"), // INET as text for simplicity
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdCreatedAtIdx: index("idx_audit_logs_tenant_id_created_at").on(
      table.tenantId,
      table.createdAt
    ),
  })
);

// ============================================================================
// Type Exports (for use in application code)
// ============================================================================

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type AutomationVersion = typeof automationVersions.$inferSelect;
export type WorkflowBinding = typeof workflowBindings.$inferSelect;
export type RunEvent = typeof runEvents.$inferSelect;
export type UsageAggregate = typeof usageAggregates.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type PricingOverride = typeof pricingOverrides.$inferSelect;
export type BillingPeriod = typeof billingPeriods.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

