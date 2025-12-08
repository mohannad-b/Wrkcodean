-- Adds requirements_text column to automation_versions if it doesn't exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'automation_versions'
      AND column_name = 'requirements_text'
  ) THEN
    ALTER TABLE automation_versions
      ADD COLUMN requirements_text TEXT;
    RAISE NOTICE 'Added requirements_text column';
  ELSE
    RAISE NOTICE 'requirements_text column already exists, skipping';
  END IF;
END $$;

