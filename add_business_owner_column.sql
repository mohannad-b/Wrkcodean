-- Add business_owner column to automation_versions (nullable text)
BEGIN;

ALTER TABLE automation_versions
ADD COLUMN IF NOT EXISTS business_owner text;

COMMIT;
