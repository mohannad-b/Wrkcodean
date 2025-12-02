import { sql } from "drizzle-orm";
import { integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import type { Blueprint } from "@/lib/blueprint/types";

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
  "BuildInProgress",
  "QATesting",
  "Live",
  "Archived",
]);

const quoteStatusEnum = pgEnum("quote_status", ["draft", "sent", "accepted", "rejected"]);
const fileStatusEnum = pgEnum("file_status", ["pending", "uploaded", "failed"]);
const aiJobStatusEnum = pgEnum("ai_job_status", ["pending", "processing", "succeeded", "failed"]);
const messageTypeEnum = pgEnum("message_type", ["client", "ops"]);
const taskStatusEnum = pgEnum("task_status", ["pending", "in_progress", "complete"]);
const taskPriorityEnum = pgEnum("task_priority", ["low", "medium", "high", "critical"]);
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
    requirementsJson: jsonb("requirements_json")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`),
    blueprintJson: jsonb("blueprint_json")
      .$type<Blueprint>()
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
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("projects_tenant_idx").on(table.tenantId),
    statusIdx: index("projects_status_idx").on(table.status),
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
    setupFee: numeric("setup_fee", { precision: 12, scale: 2 }).notNull().default("0"),
    unitPrice: numeric("unit_price", { precision: 12, scale: 4 }).notNull().default("0"),
    estimatedVolume: integer("estimated_volume"),
    notes: text("notes"),
    clientMessage: text("client_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("quotes_tenant_idx").on(table.tenantId),
    versionIdx: index("quotes_version_idx").on(table.automationVersionId),
  })
);

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

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("pending"),
    priority: taskPriorityEnum("priority").default("medium"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("tasks_tenant_idx").on(table.tenantId),
    projectIdx: index("tasks_project_idx").on(table.projectId),
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
export type Message = typeof messages.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type MembershipRole = typeof membershipRoleEnum.enumValues[number];
export type NotificationPreference = typeof notificationPreferenceEnum.enumValues[number];

