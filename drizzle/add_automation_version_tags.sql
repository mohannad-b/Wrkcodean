ALTER TABLE automation_versions
ADD COLUMN IF NOT EXISTS business_owner text;

ALTER TABLE automation_versions
ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb;
