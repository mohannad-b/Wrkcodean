ALTER TABLE "copilot_analyses" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;
ALTER TABLE "copilot_analyses" ADD COLUMN IF NOT EXISTS "stage" text;
ALTER TABLE "copilot_analyses" ADD COLUMN IF NOT EXISTS "question_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "copilot_analyses" ADD COLUMN IF NOT EXISTS "asked_questions_normalized" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "copilot_analyses" ADD COLUMN IF NOT EXISTS "facts" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "copilot_analyses" ADD COLUMN IF NOT EXISTS "assumptions" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "copilot_analyses" ADD COLUMN IF NOT EXISTS "progress" jsonb DEFAULT NULL;
ALTER TABLE "copilot_analyses" ADD COLUMN IF NOT EXISTS "last_user_message_id" uuid;
ALTER TABLE "copilot_analyses" ADD COLUMN IF NOT EXISTS "last_assistant_message_id" uuid;
ALTER TABLE "copilot_analyses" ADD COLUMN IF NOT EXISTS "workflow_updated_at" timestamptz;

UPDATE "copilot_analyses" ca
SET tenant_id = av.tenant_id
FROM automation_versions av
WHERE ca.automation_version_id = av.id AND ca.tenant_id IS NULL;

ALTER TABLE "copilot_analyses"
  ALTER COLUMN "tenant_id" SET NOT NULL;

ALTER TABLE "copilot_analyses"
  ADD CONSTRAINT IF NOT EXISTS copilot_analyses_tenant_id_fkey
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;

ALTER TABLE "copilot_analyses"
  ADD CONSTRAINT IF NOT EXISTS copilot_analyses_last_user_message_id_fkey
    FOREIGN KEY ("last_user_message_id") REFERENCES "copilot_messages"("id") ON DELETE SET NULL;

ALTER TABLE "copilot_analyses"
  ADD CONSTRAINT IF NOT EXISTS copilot_analyses_last_assistant_message_id_fkey
    FOREIGN KEY ("last_assistant_message_id") REFERENCES "copilot_messages"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS copilot_analyses_tenant_version_unique
  ON "copilot_analyses" ("tenant_id", "automation_version_id");

CREATE INDEX IF NOT EXISTS copilot_analyses_tenant_idx ON "copilot_analyses" ("tenant_id");
CREATE INDEX IF NOT EXISTS copilot_analyses_stage_idx ON "copilot_analyses" ("stage");

