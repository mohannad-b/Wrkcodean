import { sql } from "drizzle-orm";
import { date, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import type { Workflow } from "@/lib/blueprint/types";
import type { CopilotAnalysisState } from "@/lib/blueprint/copilot-analysis";

const membershipRoleEnum = pgEnum("membership_role", [
  "client_admin",
  "client_member",
  "ops_admin",
  "admin",
]);

export const automationStatusEnum = pgEnum("automation_status", [
  "IntakeInProgress",
  "NeedsPricing",
  "AwaitingClientApproval",
  "ReadyForBuild",
  "BuildInProgress",
  "QATesting",
  "Live",
  "Archived",
]);

const projectPricingStatusEnum = pgEnum("project_pricing_status", ["NotGenerated", "Draft", "Sent", "Signed"]);
const projectTypeEnum = pgEnum("project_type", ["new_automation", "revision"]);

const quoteStatusEnum = pgEnum("quote_status", ["draft", "sent", "accepted", "rejected"]);
const quoteTypeEnum = pgEnum("quote_type", ["initial_commitment", "change_order"]);
const invoiceStatusEnum = pgEnum("invoice_status", ["pending", "paid", "failed"]);
const invoiceTypeEnum = pgEnum("invoice_type", ["setup_fee"]);
const discountAppliesEnum = pgEnum("discount_applies", ["setup_fee", "unit_price", "both"]);
const discountKindEnum = pgEnum("discount_kind", ["first_congrats", "first_incentive", "followup_5", "followup_10"]);
const fileStatusEnum = pgEnum("file_status", ["pending", "uploaded", "failed"]);
const aiJobStatusEnum = pgEnum("ai_job_status", ["pending", "processing", "succeeded", "failed"]);
const messageTypeEnum = pgEnum("message_type", ["client", "ops"]);
const copilotMessageRoleEnum = pgEnum("copilot_message_role", ["user", "assistant", "system"]);
const taskStatusEnum = pgEnum("task_status", ["pending", "in_progress", "complete"]);
const taskPriorityEnum = pgEnum("task_priority", ["blocker", "important", "optional"]);
const notificationPreferenceEnum = pgEnum("notification_preference", ["all", "mentions", "none"]);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex("tenants_slug_unique").on(table.slug),
  })
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auth0Id: text("auth0_id"),
    email: text("email").notNull(),
    name: text("name"),
    title: text("title"),
    avatarUrl: text("avatar_url"),
    timezone: text("timezone"),
    notificationPreference: notificationPreferenceEnum("notification_preference").notNull().default("all"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_unique").on(table.email),
    auth0Idx: uniqueIndex("users_auth0_id_unique").on(table.auth0Id),
  })
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantUserUnique: uniqueIndex("memberships_tenant_user_unique").on(table.tenantId, table.userId),
    tenantIdx: index("memberships_tenant_idx").on(table.tenantId),
    userIdx: index("memberships_user_idx").on(table.userId),
  })
);

export const automations = pgTable(
  "automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("automations_tenant_idx").on(table.tenantId),
  })
);

export const automationVersions = pgTable(
  "automation_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    versionLabel: text("version_label").notNull().default("v1.0"),
    status: automationStatusEnum("status").notNull().default("IntakeInProgress"),
    summary: text("summary"),
    intakeNotes: text("intake_notes"),
    requirementsText: text("requirements_text"),
    requirementsJson: jsonb("requirements_json")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`),
    workflowJson: jsonb("workflow_json")
      .$type<Workflow>()
      .notNull()
      .default(
        sql`jsonb_build_object(
          'version', 1,
          'status', 'Draft',
          'summary', '',
          'sections',
            jsonb_build_array(
              jsonb_build_object('id', gen_random_uuid(), 'key', 'business_requirements', 'title', 'Business Requirements', 'content', ''),
              jsonb_build_object('id', gen_random_uuid(), 'key', 'business_objectives', 'title', 'Business Objectives', 'content', ''),
              jsonb_build_object('id', gen_random_uuid(), 'key', 'success_criteria', 'title', 'Success Criteria', 'content', ''),
              jsonb_build_object('id', gen_random_uuid(), 'key', 'systems', 'title', 'Systems', 'content', ''),
              jsonb_build_object('id', gen_random_uuid(), 'key', 'data_needs', 'title', 'Data Needs', 'content', ''),
              jsonb_build_object('id', gen_random_uuid(), 'key', 'exceptions', 'title', 'Exceptions', 'content', ''),
              jsonb_build_object('id', gen_random_uuid(), 'key', 'human_touchpoints', 'title', 'Human Touchpoints', 'content', ''),
              jsonb_build_object('id', gen_random_uuid(), 'key', 'flow_complete', 'title', 'Flow Complete', 'content', '')
            ),
          'steps', jsonb_build_array(),
          'createdAt', now(),
          'updatedAt', now()
        )`
      ),
    intakeProgress: integer("intake_progress").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    automationVersionUnique: uniqueIndex("automation_versions_unique").on(
      table.automationId,
      table.versionLabel
    ),
    tenantIdx: index("automation_versions_tenant_idx").on(table.tenantId),
    statusIdx: index("automation_versions_status_idx").on(table.status),
  })
);

export const automationMetricConfigs = pgTable(
  "automation_metric_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    automationVersionId: uuid("automation_version_id")
      .notNull()
      .references(() => automationVersions.id, { onDelete: "cascade" }),
    manualSecondsPerExecution: integer("manual_seconds_per_execution").notNull().default(300),
    hourlyRateUsd: numeric("hourly_rate_usd", { precision: 10, scale: 2 }).notNull().default("50"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueVersionConfig: uniqueIndex("automation_metric_configs_version_unique").on(table.automationVersionId),
    tenantIdx: index("automation_metric_configs_tenant_idx").on(table.tenantId),
    versionIdx: index("automation_metric_configs_version_idx").on(table.automationVersionId),
  })
);

export const automationVersionMetrics = pgTable(
  "automation_version_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    automationVersionId: uuid("automation_version_id")
      .notNull()
      .references(() => automationVersions.id, { onDelete: "cascade" }),
    asOfDate: date("as_of_date").notNull(),
    totalExecutions: integer("total_executions").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    successRate: numeric("success_rate", { precision: 6, scale: 3 }).notNull().default("0"),
    spendUsd: numeric("spend_usd", { precision: 14, scale: 4 }).notNull().default("0"),
    hoursSaved: numeric("hours_saved", { precision: 14, scale: 4 }).notNull().default("0"),
    estimatedCostSavings: numeric("estimated_cost_savings", { precision: 14, scale: 2 }).notNull().default("0"),
    hoursSavedDeltaPct: numeric("hours_saved_delta_pct", { precision: 6, scale: 2 }),
    estimatedCostSavingsDeltaPct: numeric("estimated_cost_savings_delta_pct", { precision: 6, scale: 2 }),
    executionsDeltaPct: numeric("executions_delta_pct", { precision: 6, scale: 2 }),
    successRateDeltaPct: numeric("success_rate_delta_pct", { precision: 6, scale: 2 }),
    spendDeltaPct: numeric("spend_delta_pct", { precision: 6, scale: 2 }),
    source: text("source").notNull().default("wrk_platform"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueVersionDate: uniqueIndex("automation_version_metrics_version_date_unique").on(
      table.automationVersionId,
      table.asOfDate
    ),
    tenantIdx: index("automation_version_metrics_tenant_idx").on(table.tenantId),
    versionIdx: index("automation_version_metrics_version_idx").on(table.automationVersionId),
    asOfIdx: index("automation_version_metrics_asof_idx").on(table.asOfDate),
  })
);

export const automationVersionFiles = pgTable(
  "automation_version_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    automationVersionId: uuid("automation_version_id")
      .notNull()
      .references(() => automationVersions.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    storageUrl: text("storage_url"),
    status: fileStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("automation_version_files_tenant_idx").on(table.tenantId),
    versionIdx: index("automation_version_files_version_idx").on(table.automationVersionId),
  })
);

export const aiJobs = pgTable(
  "ai_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    automationVersionId: uuid("automation_version_id")
      .notNull()
      .references(() => automationVersions.id, { onDelete: "cascade" }),
    jobType: text("job_type").notNull().default("requirements_blueprint_v1"),
    status: aiJobStatusEnum("status").notNull().default("pending"),
    inputSummary: text("input_summary"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("ai_jobs_tenant_idx").on(table.tenantId),
    versionIdx: index("ai_jobs_version_idx").on(table.automationVersionId),
  })
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id").references(() => automations.id, { onDelete: "set null" }),
    automationVersionId: uuid("automation_version_id").references(() => automationVersions.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    status: automationStatusEnum("status").notNull().default("IntakeInProgress"),
    pricingStatus: projectPricingStatusEnum("pricing_status").notNull().default("NotGenerated"),
    type: projectTypeEnum("type").notNull().default("new_automation"),
    checklistProgress: integer("checklist_progress").notNull().default(0),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("projects_tenant_idx").on(table.tenantId),
    statusIdx: index("projects_status_idx").on(table.status),
    pricingStatusIdx: index("projects_pricing_status_idx").on(table.pricingStatus),
  })
);

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    automationVersionId: uuid("automation_version_id")
      .notNull()
      .references(() => automationVersions.id, { onDelete: "cascade" }),
    status: quoteStatusEnum("status").notNull().default("draft"),
    quoteType: quoteTypeEnum("quote_type").notNull().default("initial_commitment"),
    currency: text("currency").notNull().default("USD"),
    setupFee: numeric("setup_fee", { precision: 12, scale: 2 }).notNull().default("0"),
    unitPrice: numeric("unit_price", { precision: 12, scale: 4 }).notNull().default("0"),
    effectiveUnitPrice: numeric("effective_unit_price", { precision: 12, scale: 4 }).notNull().default("0"),
    estimatedVolume: integer("estimated_volume"),
    notes: text("notes"),
    clientMessage: text("client_message"),
    discountsJson: jsonb("discounts_json").$type<Record<string, unknown>>().notNull().default(sql`'[]'::jsonb`),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signatureMetadata: jsonb("signature_metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("quotes_tenant_idx").on(table.tenantId),
    versionIdx: index("quotes_version_idx").on(table.automationVersionId),
  })
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "set null" }),
    type: invoiceTypeEnum("type").notNull().default("setup_fee"),
    status: invoiceStatusEnum("status").notNull().default("pending"),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull().default("0"),
    currency: text("currency").notNull().default("USD"),
    providerChargeId: text("provider_charge_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("invoices_tenant_idx").on(table.tenantId),
    quoteIdx: index("invoices_quote_idx").on(table.quoteId),
    projectIdx: index("invoices_project_idx").on(table.projectId),
  })
);

export const discountOffers = pgTable(
  "discount_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    automationVersionId: uuid("automation_version_id")
      .notNull()
      .references(() => automationVersions.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    percent: numeric("percent", { precision: 5, scale: 4 }).notNull().default("0"),
    appliesTo: discountAppliesEnum("applies_to").notNull().default("setup_fee"),
    kind: discountKindEnum("kind").notNull().default("followup_5"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("discount_offers_tenant_idx").on(table.tenantId),
    versionIdx: index("discount_offers_version_idx").on(table.automationVersionId),
    codeIdx: uniqueIndex("discount_offers_code_unique").on(table.code),
  })
);

export const copilotMessages = pgTable(
  "copilot_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    automationVersionId: uuid("automation_version_id")
      .notNull()
      .references(() => automationVersions.id, { onDelete: "cascade" }),
    role: copilotMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("copilot_messages_tenant_idx").on(table.tenantId),
    versionIdx: index("copilot_messages_version_idx").on(table.automationVersionId),
  })
);

export const copilotAnalyses = pgTable("copilot_analyses", {
  automationVersionId: uuid("automation_version_id")
    .primaryKey()
    .references(() => automationVersions.id, { onDelete: "cascade" }),
  analysisJson: jsonb("analysis_json").$type<CopilotAnalysisState>().notNull(),
  version: text("version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    automationVersionId: uuid("automation_version_id").references(() => automationVersions.id, {
      onDelete: "set null",
    }),
    type: messageTypeEnum("type").notNull(),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("messages_tenant_idx").on(table.tenantId),
    projectIdx: index("messages_project_idx").on(table.projectId),
  })
);

export type TaskMetadata = {
  systemType?: string;
  relatedSteps?: string[];
  isBlocker?: boolean;
};

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    automationVersionId: uuid("automation_version_id").references(() => automationVersions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("pending"),
    priority: taskPriorityEnum("priority").default("important"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<TaskMetadata>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("tasks_tenant_idx").on(table.tenantId),
    projectIdx: index("tasks_project_idx").on(table.projectId),
    versionIdx: index("tasks_version_idx").on(table.automationVersionId),
  })
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("audit_logs_tenant_idx").on(table.tenantId),
    createdIdx: index("audit_logs_created_idx").on(table.createdAt),
  })
);

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type AutomationVersion = typeof automationVersions.$inferSelect;
export type AutomationVersionFile = typeof automationVersionFiles.$inferSelect;
export type AiJob = typeof aiJobs.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type CopilotMessage = typeof copilotMessages.$inferSelect;
export type CopilotAnalysis = typeof copilotAnalyses.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type AutomationMetricConfig = typeof automationMetricConfigs.$inferSelect;
export type AutomationVersionMetric = typeof automationVersionMetrics.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type MembershipRole = typeof membershipRoleEnum.enumValues[number];
export type NotificationPreference = typeof notificationPreferenceEnum.enumValues[number];
export type CopilotMessageRole = typeof copilotMessageRoleEnum.enumValues[number];

