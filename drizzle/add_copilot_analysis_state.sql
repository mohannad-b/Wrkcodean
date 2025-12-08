CREATE TABLE IF NOT EXISTS "copilot_analyses" (
  "automation_version_id" uuid PRIMARY KEY REFERENCES "automation_versions"("id") ON DELETE CASCADE,
  "analysis_json" jsonb NOT NULL,
  "version" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);


