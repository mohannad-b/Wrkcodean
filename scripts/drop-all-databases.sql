-- Drop all databases script
-- WARNING: This will delete ALL databases in the PostgreSQL instance
-- Use with extreme caution! This is a destructive operation.
--
-- Usage: psql -U postgres -f scripts/drop-all-databases.sql
--
-- Note: You cannot drop a database while connected to it.
-- Connect to the 'postgres' database instead.

-- Step 1: Terminate all connections to non-system databases
-- This can run in a transaction block
DO $$
DECLARE
    db_name text;
BEGIN
    FOR db_name IN 
        SELECT datname
        FROM pg_database
        WHERE datistemplate = false
          AND datname != 'postgres'
    LOOP
        -- Terminate all connections to each database
        PERFORM pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = db_name
          AND pid <> pg_backend_pid();
        
        RAISE NOTICE 'Terminated connections to database: %', db_name;
    END LOOP;
END $$;

-- Step 2: Generate and execute DROP DATABASE statements
-- DROP DATABASE cannot run inside a transaction block, so we use \gexec
-- This will execute each generated statement immediately
-- Note: \gexec requires PostgreSQL 9.6+. If you have an older version,
--       comment out the \gexec line and manually copy/execute the output
SELECT format('DROP DATABASE IF EXISTS %I;', datname) as drop_statement
FROM pg_database
WHERE datistemplate = false
  AND datname != 'postgres'
ORDER BY datname
\gexec

-- Alternative: If you know the specific database name, use this instead:
-- DROP DATABASE IF EXISTS your_database_name;

-- Alternative manual method (if \gexec doesn't work):
-- 1. Comment out the \gexec line above
-- 2. Run the script to see the DROP statements
-- 3. Copy and paste each DROP DATABASE statement and execute them one by one

