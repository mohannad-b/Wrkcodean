ALTER TABLE "tasks"
ADD COLUMN IF NOT EXISTS "automation_version_id" uuid REFERENCES "automation_versions"("id") ON DELETE CASCADE;

UPDATE "tasks"
SET "automation_version_id" = "projects"."automation_version_id"
FROM "projects"
WHERE
  "tasks"."project_id" = "projects"."id"
  AND "tasks"."automation_version_id" IS NULL;

CREATE INDEX IF NOT EXISTS "tasks_version_idx"
ON "tasks" ("automation_version_id");

