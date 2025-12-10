-- Add tags column to automation_versions for LLM-generated labels on settings
BEGIN;

-- Add column if missing
ALTER TABLE automation_versions
ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Backfill any existing nulls (if the column already existed but was nullable)
UPDATE automation_versions
SET tags = '[]'::jsonb
WHERE tags IS NULL;

-- Ensure default and constraint are in place (idempotent if column existed)
ALTER TABLE automation_versions
ALTER COLUMN tags SET DEFAULT '[]'::jsonb,
ALTER COLUMN tags SET NOT NULL;

COMMIT;
