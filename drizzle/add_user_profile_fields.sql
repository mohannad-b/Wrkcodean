DO $$ BEGIN
  CREATE TYPE "notification_preference" AS ENUM ('all', 'mentions', 'none');
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "title" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" text;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "notification_preference" "notification_preference" NOT NULL DEFAULT 'all';

ALTER TABLE "users"
  ALTER COLUMN "notification_preference" SET DEFAULT 'all';

UPDATE "users"
SET "notification_preference" = 'all'
WHERE "notification_preference" IS NULL;

