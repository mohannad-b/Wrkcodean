-- Rename project enums to submission enums
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_pricing_status') THEN
    ALTER TYPE project_pricing_status RENAME TO submission_pricing_status;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_type') THEN
    ALTER TYPE project_type RENAME TO submission_type;
  END IF;
END$$;

-- Rename projects table to submissions
ALTER TABLE IF EXISTS projects RENAME TO submissions;

-- Rename indexes on submissions table
ALTER INDEX IF EXISTS projects_tenant_idx RENAME TO submissions_tenant_idx;
ALTER INDEX IF EXISTS projects_status_idx RENAME TO submissions_status_idx;
ALTER INDEX IF EXISTS projects_pricing_status_idx RENAME TO submissions_pricing_status_idx;

-- Rename FK columns that pointed to projects
ALTER TABLE IF EXISTS invoices RENAME COLUMN project_id TO submission_id;
ALTER TABLE IF EXISTS messages RENAME COLUMN project_id TO submission_id;
ALTER TABLE IF EXISTS tasks RENAME COLUMN project_id TO submission_id;

-- Rename related indexes
ALTER INDEX IF EXISTS invoices_project_idx RENAME TO invoices_submission_idx;
ALTER INDEX IF EXISTS messages_project_idx RENAME TO messages_submission_idx;
ALTER INDEX IF EXISTS tasks_project_idx RENAME TO tasks_submission_idx;

-- Recreate foreign keys to point at submissions table with new column names
ALTER TABLE IF EXISTS invoices DROP CONSTRAINT IF EXISTS invoices_project_id_projects_id_fk;
ALTER TABLE IF EXISTS invoices DROP CONSTRAINT IF EXISTS invoices_project_id_fkey;
ALTER TABLE IF EXISTS invoices
  ADD CONSTRAINT invoices_submission_id_submissions_id_fk
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS messages DROP CONSTRAINT IF EXISTS messages_project_id_projects_id_fk;
ALTER TABLE IF EXISTS messages DROP CONSTRAINT IF EXISTS messages_project_id_fkey;
ALTER TABLE IF EXISTS messages
  ADD CONSTRAINT messages_submission_id_submissions_id_fk
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS tasks DROP CONSTRAINT IF EXISTS tasks_project_id_projects_id_fk;
ALTER TABLE IF EXISTS tasks DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;
ALTER TABLE IF EXISTS tasks
  ADD CONSTRAINT tasks_submission_id_submissions_id_fk
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE;

