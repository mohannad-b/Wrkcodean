-- Migration: Rename blueprint_json to workflow_json and add requirements_text
-- This migration:
-- 1. Renames the blueprint_json column to workflow_json (if it exists)
-- 2. Adds the requirements_text column for storing plain English requirements

-- Step 1: Rename blueprint_json to workflow_json (if it exists and workflow_json doesn't)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'automation_versions' 
    AND column_name = 'blueprint_json'
  ) AND NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'automation_versions' 
    AND column_name = 'workflow_json'
  ) THEN
    ALTER TABLE automation_versions 
    RENAME COLUMN blueprint_json TO workflow_json;
    RAISE NOTICE 'Renamed blueprint_json to workflow_json';
  ELSIF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public'
    AND table_name = 'automation_versions' 
    AND column_name = 'workflow_json'
  ) THEN
    RAISE NOTICE 'workflow_json column already exists, skipping rename';
  ELSE
    RAISE NOTICE 'blueprint_json column does not exist, skipping rename';
  END IF;
END $$;

-- Step 2: Add requirements_text column if it doesn't exist
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
