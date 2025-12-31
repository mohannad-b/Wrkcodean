CREATE TABLE IF NOT EXISTS "copilot_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  "automation_version_id" uuid NOT NULL REFERENCES automation_versions(id) ON DELETE CASCADE,
  "client_message_id" text NOT NULL,
  "user_message_id" uuid NOT NULL REFERENCES copilot_messages(id) ON DELETE CASCADE,
  "assistant_message_id" uuid NOT NULL REFERENCES copilot_messages(id) ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "copilot_runs_client_message_unique"
  ON "copilot_runs" ("tenant_id", "automation_version_id", "client_message_id");

