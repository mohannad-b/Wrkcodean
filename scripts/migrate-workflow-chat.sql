-- Migration: Add Workflow Chat System
-- This migration adds tables and enums for the real-time workflow chat feature

-- ============================================================================
-- 1. Create Enums
-- ============================================================================

CREATE TYPE "workflow_message_sender_type" AS ENUM ('client', 'wrk', 'system');
CREATE TYPE "wrk_staff_role" AS ENUM ('wrk_admin', 'wrk_operator', 'wrk_viewer');

-- ============================================================================
-- 2. Create Tables
-- ============================================================================

-- Workflow Conversations
-- One conversation per workflow (tenantId + automationVersionId)
CREATE TABLE "workflow_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "automation_version_id" uuid NOT NULL REFERENCES "automation_versions"("id") ON DELETE CASCADE,
  "assigned_to_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workflow_conversations_tenant_workflow_unique" UNIQUE ("tenant_id", "automation_version_id")
);

-- Workflow Messages
-- Messages in conversations with support for client/wrk/system sender types
CREATE TABLE "workflow_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "workflow_conversations"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "automation_version_id" uuid NOT NULL REFERENCES "automation_versions"("id") ON DELETE CASCADE,
  "sender_type" "workflow_message_sender_type" NOT NULL,
  "sender_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "body" text NOT NULL,
  "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "client_generated_id" text,
  "edited_at" timestamptz,
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- Workflow Read Receipts
-- Tracks last read message per user per conversation
CREATE TABLE "workflow_read_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "workflow_conversations"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "last_read_message_id" uuid REFERENCES "workflow_messages"("id") ON DELETE SET NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "workflow_read_receipts_conversation_user_unique" UNIQUE ("conversation_id", "user_id")
);

-- Wrk Staff Memberships
-- Tracks Wrk internal staff roles (separate from workspace memberships)
CREATE TABLE "wrk_staff_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "wrk_staff_role" NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "wrk_staff_memberships_user_unique" UNIQUE ("user_id")
);

-- ============================================================================
-- 3. Create Indexes
-- ============================================================================

-- Workflow Conversations indexes
CREATE INDEX "workflow_conversations_tenant_idx" ON "workflow_conversations"("tenant_id");
CREATE INDEX "workflow_conversations_workflow_idx" ON "workflow_conversations"("automation_version_id");
CREATE INDEX "workflow_conversations_created_at_idx" ON "workflow_conversations"("created_at");

-- Workflow Messages indexes
CREATE INDEX "workflow_messages_conversation_idx" ON "workflow_messages"("conversation_id");
CREATE INDEX "workflow_messages_tenant_workflow_idx" ON "workflow_messages"("tenant_id", "automation_version_id");
CREATE INDEX "workflow_messages_created_at_idx" ON "workflow_messages"("created_at");
CREATE INDEX "workflow_messages_client_generated_id_idx" ON "workflow_messages"("client_generated_id");

-- Workflow Read Receipts indexes
CREATE INDEX "workflow_read_receipts_conversation_idx" ON "workflow_read_receipts"("conversation_id");
CREATE INDEX "workflow_read_receipts_user_idx" ON "workflow_read_receipts"("user_id");

-- Wrk Staff Memberships indexes
CREATE INDEX "wrk_staff_memberships_user_idx" ON "wrk_staff_memberships"("user_id");

-- ============================================================================
-- Migration Complete
-- ============================================================================

