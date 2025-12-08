ALTER TABLE "tasks"
ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb;

UPDATE "tasks"
SET "metadata" = COALESCE("metadata", '{}'::jsonb)
WHERE "metadata" IS NULL;

ALTER TABLE "tasks"
ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;

ALTER TABLE "tasks"
ALTER COLUMN "metadata" SET NOT NULL;

