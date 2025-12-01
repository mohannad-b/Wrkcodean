import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as {
  pgPool?: Pool;
};

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("[db] DATABASE_URL is not set. Database operations will fail until configured.");
}

export const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString,
  });

if (!globalForDb.pgPool) {
  globalForDb.pgPool = pool;
}

export const db = drizzle(pool, { schema });
export type DbClient = typeof db;

