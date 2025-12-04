-- Ensure tasks table matches application expectations

-- automation_version_id linkage
ALTER TABLE "tasks"
ADD COLUMN IF NOT EXISTS "automation_version_id" uuid REFERENCES "automation_versions"("id") ON DELETE CASCADE;

-- Backfill automation_version_id using related projects when possible
WITH project_versions AS (
  SELECT
    "tasks"."id" AS task_id,
    "projects"."automation_version_id" AS version_id
  FROM "tasks"
  JOIN "projects" ON "projects"."id" = "tasks"."project_id"
  WHERE
    "tasks"."automation_version_id" IS NULL
    AND "projects"."automation_version_id" IS NOT NULL
)
UPDATE "tasks"
SET "automation_version_id" = project_versions.version_id
FROM project_versions
WHERE "tasks"."id" = project_versions.task_id;

CREATE INDEX IF NOT EXISTS "tasks_version_idx"
ON "tasks" ("automation_version_id");

-- metadata payload for task details
ALTER TABLE "tasks"
ADD COLUMN IF NOT EXISTS "metadata" jsonb;

UPDATE "tasks"
SET "metadata" = '{}'::jsonb
WHERE "metadata" IS NULL;

ALTER TABLE "tasks"
ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;

ALTER TABLE "tasks"
ALTER COLUMN "metadata" SET NOT NULL;

-- task_priority enum values required by app
DO $$
BEGIN
  ALTER TYPE "task_priority" ADD VALUE IF NOT EXISTS 'blocker';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "task_priority" ADD VALUE IF NOT EXISTS 'important';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE "task_priority" ADD VALUE IF NOT EXISTS 'optional';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

