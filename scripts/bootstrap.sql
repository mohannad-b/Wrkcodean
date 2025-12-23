-- Bootstrap schema for WRK Copilot (drop + recreate everything)
-- This script creates all tables, types, and indexes needed for the application
--
-- Usage: psql $DATABASE_URL -f scripts/bootstrap.sql
-- Note: The database must already exist. Create it first with:
--       CREATE DATABASE your_database_name;

-- ============================================================================
-- STEP 1: Drop all tables (CASCADE will handle dependencies)
-- ============================================================================
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS file_versions CASCADE;
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS copilot_analyses CASCADE;
DROP TABLE IF EXISTS copilot_messages CASCADE;
DROP TABLE IF EXISTS discount_offers CASCADE;
DROP TABLE IF EXISTS quotes CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS ai_jobs CASCADE;
DROP TABLE IF EXISTS automation_version_metrics CASCADE;
DROP TABLE IF EXISTS automation_metric_configs CASCADE;
DROP TABLE IF EXISTS automation_versions CASCADE;
DROP TABLE IF EXISTS automations CASCADE;
DROP TABLE IF EXISTS workspace_invites CASCADE;
DROP TABLE IF EXISTS memberships CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- ============================================================================
-- STEP 2: Drop all enums (must be done after tables that use them)
-- ============================================================================
DROP TYPE IF EXISTS task_priority CASCADE;
DROP TYPE IF EXISTS task_status CASCADE;
DROP TYPE IF EXISTS message_type CASCADE;
DROP TYPE IF EXISTS copilot_message_role CASCADE;
DROP TYPE IF EXISTS ai_job_status CASCADE;
DROP TYPE IF EXISTS file_status CASCADE;
DROP TYPE IF EXISTS quote_status CASCADE;
DROP TYPE IF EXISTS quote_type CASCADE;
DROP TYPE IF EXISTS invoice_status CASCADE;
DROP TYPE IF EXISTS invoice_type CASCADE;
DROP TYPE IF EXISTS discount_applies CASCADE;
DROP TYPE IF EXISTS discount_kind CASCADE;
DROP TYPE IF EXISTS automation_status CASCADE;
DROP TYPE IF EXISTS project_pricing_status CASCADE;
DROP TYPE IF EXISTS project_type CASCADE;
DROP TYPE IF EXISTS membership_role CASCADE;
DROP TYPE IF EXISTS membership_status CASCADE;
DROP TYPE IF EXISTS workspace_invite_status CASCADE;
DROP TYPE IF EXISTS notification_preference CASCADE;

-- ============================================================================
-- STEP 3: Create extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- STEP 4: Create enumerations
-- ============================================================================
CREATE TYPE membership_role AS ENUM ('owner','admin','editor','viewer','billing');
CREATE TYPE membership_status AS ENUM ('active','invited','removed');
CREATE TYPE workspace_invite_status AS ENUM ('pending','accepted','cancelled','expired');
CREATE TYPE automation_status AS ENUM (
  'IntakeInProgress',
  'NeedsPricing',
  'AwaitingClientApproval',
  'ReadyForBuild',
  'BuildInProgress',
  'QATesting',
  'Live',
  'Archived'
);
CREATE TYPE project_pricing_status AS ENUM ('NotGenerated','Draft','Sent','Signed');
CREATE TYPE project_type AS ENUM ('new_automation','revision');
CREATE TYPE quote_type AS ENUM ('initial_commitment','change_order');
CREATE TYPE quote_status AS ENUM ('draft','sent','accepted','rejected');
CREATE TYPE invoice_status AS ENUM ('pending','paid','failed');
CREATE TYPE invoice_type AS ENUM ('setup_fee');
CREATE TYPE discount_applies AS ENUM ('setup_fee','unit_price','both');
CREATE TYPE discount_kind AS ENUM ('first_congrats','first_incentive','followup_5','followup_10');
CREATE TYPE file_status AS ENUM ('pending','uploaded','failed');
CREATE TYPE ai_job_status AS ENUM ('pending','processing','succeeded','failed');
CREATE TYPE message_type AS ENUM ('client','ops');
CREATE TYPE copilot_message_role AS ENUM ('user','assistant','system');
CREATE TYPE task_status AS ENUM ('pending','in_progress','complete');
CREATE TYPE task_priority AS ENUM ('blocker','important','optional');
CREATE TYPE notification_preference AS ENUM ('all','mentions','none');

-- ============================================================================
-- STEP 5: Create tables
-- ============================================================================

-- Tenants
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  industry text,
  currency text DEFAULT 'usd',
  timezone text DEFAULT 'est',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_slug_unique UNIQUE (slug)
);

-- Users
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_id text,
  email text NOT NULL,
  first_name text,
  last_name text,
  name text, -- Keep for backward compatibility, will be computed from first_name/last_name
  title text,
  avatar_url text,
  timezone text,
  phone text,
  phone_verified integer NOT NULL DEFAULT 0,
  tos_accepted_at timestamptz,
  tos_version text,
  notification_preference notification_preference NOT NULL DEFAULT 'all',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_auth0_id_unique UNIQUE (auth0_id)
);

-- Memberships
CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role membership_role NOT NULL,
  status membership_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_tenant_user_unique UNIQUE (tenant_id, user_id)
);

-- Workspace Invites
CREATE TABLE workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role membership_role NOT NULL,
  token text NOT NULL,
  status workspace_invite_status NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  CONSTRAINT workspace_invites_token_unique UNIQUE (token)
);
CREATE INDEX workspace_invites_tenant_idx ON workspace_invites(tenant_id);
CREATE INDEX workspace_invites_email_idx ON workspace_invites(email);

-- Automations
CREATE TABLE automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Automation Versions
CREATE TABLE automation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  version_label text NOT NULL DEFAULT 'v1.0',
  status automation_status NOT NULL DEFAULT 'IntakeInProgress',
  summary text,
  intake_notes text,
  business_owner text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  requirements_text text,
  requirements_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  workflow_json jsonb NOT NULL DEFAULT jsonb_build_object(
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
  ),
  intake_progress integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_versions_unique UNIQUE (automation_id, version_label)
);

-- Automation Metric Configs
CREATE TABLE automation_metric_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  automation_version_id uuid NOT NULL REFERENCES automation_versions(id) ON DELETE CASCADE,
  manual_seconds_per_execution integer NOT NULL DEFAULT 300,
  hourly_rate_usd numeric(10,2) NOT NULL DEFAULT 50,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_metric_configs_version_unique UNIQUE (automation_version_id)
);

-- Automation Version Metrics
CREATE TABLE automation_version_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  automation_version_id uuid NOT NULL REFERENCES automation_versions(id) ON DELETE CASCADE,
  as_of_date date NOT NULL,
  total_executions integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  success_rate numeric(6,3) NOT NULL DEFAULT 0,
  spend_usd numeric(14,4) NOT NULL DEFAULT 0,
  hours_saved numeric(14,4) NOT NULL DEFAULT 0,
  estimated_cost_savings numeric(14,2) NOT NULL DEFAULT 0,
  hours_saved_delta_pct numeric(6,2),
  estimated_cost_savings_delta_pct numeric(6,2),
  executions_delta_pct numeric(6,2),
  success_rate_delta_pct numeric(6,2),
  spend_delta_pct numeric(6,2),
  source text NOT NULL DEFAULT 'wrk_platform',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_version_metrics_version_date_unique UNIQUE (automation_version_id, as_of_date)
);

-- Files (generic, versioned)
CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  purpose text NOT NULL DEFAULT 'generic',
  resource_type text,
  resource_id text,
  title text,
  latest_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- File Versions (encrypted payload references)
CREATE TABLE file_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  version integer NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  checksum_sha256 text NOT NULL,
  storage_key text NOT NULL,
  storage_url text,
  source text NOT NULL DEFAULT 'upload',
  source_url text,
  encryption jsonb NOT NULL,
  status file_status NOT NULL DEFAULT 'uploaded',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT file_versions_unique_version UNIQUE (file_id, version)
);

-- AI Jobs
CREATE TABLE ai_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  automation_version_id uuid NOT NULL REFERENCES automation_versions(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'requirements_blueprint_v1',
  status ai_job_status NOT NULL DEFAULT 'pending',
  input_summary text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Projects
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  automation_id uuid REFERENCES automations(id) ON DELETE SET NULL,
  automation_version_id uuid REFERENCES automation_versions(id) ON DELETE SET NULL,
  name text NOT NULL,
  status automation_status NOT NULL DEFAULT 'IntakeInProgress',
  pricing_status project_pricing_status NOT NULL DEFAULT 'NotGenerated',
  type project_type NOT NULL DEFAULT 'new_automation',
  checklist_progress integer NOT NULL DEFAULT 0,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Quotes
CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  automation_version_id uuid NOT NULL REFERENCES automation_versions(id) ON DELETE CASCADE,
  status quote_status NOT NULL DEFAULT 'draft',
  quote_type quote_type NOT NULL DEFAULT 'initial_commitment',
  currency text NOT NULL DEFAULT 'USD',
  setup_fee numeric(12,2) NOT NULL DEFAULT 0,
  unit_price numeric(12,4) NOT NULL DEFAULT 0,
  effective_unit_price numeric(12,4) NOT NULL DEFAULT 0,
  estimated_volume integer,
  notes text,
  client_message text,
  discounts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz,
  signed_at timestamptz,
  signature_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Invoices
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  type invoice_type NOT NULL DEFAULT 'setup_fee',
  status invoice_status NOT NULL DEFAULT 'pending',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  provider_charge_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Discount Offers
CREATE TABLE discount_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  automation_version_id uuid NOT NULL REFERENCES automation_versions(id) ON DELETE CASCADE,
  code text NOT NULL,
  percent numeric(5,4) NOT NULL DEFAULT 0,
  applies_to discount_applies NOT NULL DEFAULT 'setup_fee',
  kind discount_kind NOT NULL DEFAULT 'followup_5',
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discount_offers_code_unique UNIQUE (code)
);

-- Copilot Messages
CREATE TABLE copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  automation_version_id uuid NOT NULL REFERENCES automation_versions(id) ON DELETE CASCADE,
  role copilot_message_role NOT NULL,
  content text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Copilot Analyses
CREATE TABLE copilot_analyses (
  automation_version_id uuid PRIMARY KEY REFERENCES automation_versions(id) ON DELETE CASCADE,
  analysis_json jsonb NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Messages
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  automation_version_id uuid REFERENCES automation_versions(id) ON DELETE SET NULL,
  type message_type NOT NULL,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tasks
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  automation_version_id uuid REFERENCES automation_versions(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status task_status NOT NULL DEFAULT 'pending',
  priority task_priority DEFAULT 'important',
  assignee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  due_date timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Audit Logs
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- STEP 6: Create indexes
-- ============================================================================

-- Memberships indexes
CREATE INDEX memberships_tenant_idx ON memberships(tenant_id);
CREATE INDEX memberships_user_idx ON memberships(user_id);

-- Automations indexes
CREATE INDEX automations_tenant_idx ON automations(tenant_id);
CREATE INDEX automations_created_by_idx ON automations(created_by);
CREATE INDEX automations_updated_at_idx ON automations(updated_at);

-- Automation Versions indexes
CREATE INDEX automation_versions_tenant_idx ON automation_versions(tenant_id);
CREATE INDEX automation_versions_automation_id_idx ON automation_versions(automation_id);
CREATE INDEX automation_versions_status_idx ON automation_versions(status);
CREATE INDEX automation_versions_created_at_idx ON automation_versions(created_at);

-- Automation Metric Configs indexes
CREATE INDEX automation_metric_configs_tenant_idx ON automation_metric_configs(tenant_id);
CREATE INDEX automation_metric_configs_version_idx ON automation_metric_configs(automation_version_id);

-- Automation Version Metrics indexes
CREATE INDEX automation_version_metrics_tenant_idx ON automation_version_metrics(tenant_id);
CREATE INDEX automation_version_metrics_version_idx ON automation_version_metrics(automation_version_id);
CREATE INDEX automation_version_metrics_asof_idx ON automation_version_metrics(as_of_date);

-- Files indexes
CREATE INDEX files_tenant_idx ON files(tenant_id);
CREATE INDEX files_resource_idx ON files(resource_type, resource_id);

-- File Versions indexes
CREATE INDEX file_versions_tenant_idx ON file_versions(tenant_id);
CREATE INDEX file_versions_file_idx ON file_versions(file_id);

-- AI Jobs indexes
CREATE INDEX ai_jobs_tenant_idx ON ai_jobs(tenant_id);
CREATE INDEX ai_jobs_version_idx ON ai_jobs(automation_version_id);

-- Projects indexes
CREATE INDEX projects_tenant_idx ON projects(tenant_id);
CREATE INDEX projects_status_idx ON projects(status);
CREATE INDEX projects_pricing_status_idx ON projects(pricing_status);

-- Quotes indexes
CREATE INDEX quotes_tenant_idx ON quotes(tenant_id);
CREATE INDEX quotes_version_idx ON quotes(automation_version_id);

-- Invoices indexes
CREATE INDEX invoices_tenant_idx ON invoices(tenant_id);
CREATE INDEX invoices_quote_idx ON invoices(quote_id);
CREATE INDEX invoices_project_idx ON invoices(project_id);

-- Discount Offers indexes
CREATE INDEX discount_offers_tenant_idx ON discount_offers(tenant_id);
CREATE INDEX discount_offers_version_idx ON discount_offers(automation_version_id);

-- Copilot Messages indexes
CREATE INDEX copilot_messages_tenant_idx ON copilot_messages(tenant_id);
CREATE INDEX copilot_messages_version_idx ON copilot_messages(automation_version_id);
CREATE INDEX copilot_messages_version_created_at_idx ON copilot_messages(automation_version_id, created_at);

-- Messages indexes
CREATE INDEX messages_tenant_idx ON messages(tenant_id);
CREATE INDEX messages_project_idx ON messages(project_id);

-- Tasks indexes
CREATE INDEX tasks_tenant_idx ON tasks(tenant_id);
CREATE INDEX tasks_project_idx ON tasks(project_id);
CREATE INDEX tasks_version_idx ON tasks(automation_version_id);

-- Audit Logs indexes
CREATE INDEX audit_logs_tenant_idx ON audit_logs(tenant_id);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs (tenant_id, resource_type, resource_id, created_at DESC);
