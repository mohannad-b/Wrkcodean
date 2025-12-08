DO $$ BEGIN
  CREATE TYPE "copilot_message_role" AS ENUM ('user', 'assistant', 'system');
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

CREATE TABLE IF NOT EXISTS "copilot_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "automation_version_id" uuid NOT NULL REFERENCES "automation_versions"("id") ON DELETE CASCADE,
  "role" "copilot_message_role" NOT NULL,
  "content" text NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "copilot_messages_tenant_idx" ON "copilot_messages" ("tenant_id");
CREATE INDEX IF NOT EXISTS "copilot_messages_version_idx" ON "copilot_messages" ("automation_version_id");

