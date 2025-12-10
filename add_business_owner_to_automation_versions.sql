-- Add business_owner column to automation_versions for General settings owner field
BEGIN;

ALTER TABLE automation_versions
ADD COLUMN IF NOT EXISTS business_owner text;

COMMIT;
