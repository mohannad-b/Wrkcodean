-- Migration: Add first_name and last_name columns to users table
-- This migration adds first_name and last_name columns and migrates existing name data
-- 
-- Usage: psql $DATABASE_URL -f scripts/migrate-add-user-name-fields.sql
-- 
-- This migration is idempotent and can be run multiple times safely.

-- ============================================================================
-- STEP 1: Add first_name and last_name columns if they don't exist
-- ============================================================================

-- Add first_name column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'first_name'
    ) THEN
        ALTER TABLE users ADD COLUMN first_name text;
        RAISE NOTICE 'Added first_name column to users table';
    ELSE
        RAISE NOTICE 'first_name column already exists, skipping';
    END IF;
END $$;

-- Add last_name column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'last_name'
    ) THEN
        ALTER TABLE users ADD COLUMN last_name text;
        RAISE NOTICE 'Added last_name column to users table';
    ELSE
        RAISE NOTICE 'last_name column already exists, skipping';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Migrate existing name data to first_name and last_name
-- ============================================================================
-- This step splits existing name values into first_name and last_name
-- Only updates rows where first_name and last_name are both NULL
-- to avoid overwriting data that may have been manually set

UPDATE users
SET 
    first_name = CASE 
        WHEN name IS NULL OR trim(name) = '' THEN NULL
        WHEN position(' ' in trim(name)) = 0 THEN trim(name)  -- Single word, use as first name
        ELSE split_part(trim(name), ' ', 1)  -- First word
    END,
    last_name = CASE 
        WHEN name IS NULL OR trim(name) = '' THEN NULL
        WHEN position(' ' in trim(name)) = 0 THEN NULL  -- Single word, no last name
        ELSE substring(trim(name) from position(' ' in trim(name)) + 1)  -- Everything after first space
    END
WHERE 
    (first_name IS NULL AND last_name IS NULL)
    AND name IS NOT NULL 
    AND trim(name) != '';

-- ============================================================================
-- STEP 3: Update name field to be computed from first_name/last_name
-- ============================================================================
-- This ensures the name field stays in sync with first_name/last_name
-- Note: This is a one-time update. Future updates should maintain name via application logic

UPDATE users
SET name = CASE
    WHEN first_name IS NOT NULL AND last_name IS NOT NULL THEN first_name || ' ' || last_name
    WHEN first_name IS NOT NULL THEN first_name
    WHEN last_name IS NOT NULL THEN last_name
    ELSE name  -- Keep existing name if both are null
END
WHERE (first_name IS NOT NULL OR last_name IS NOT NULL)
    AND (
        name IS NULL 
        OR name != COALESCE(first_name || ' ' || last_name, first_name, last_name, '')
    );

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- The first_name and last_name columns have been added and populated.
-- The name column is kept for backward compatibility.
-- Future application code should update first_name and last_name, and compute name from them.

