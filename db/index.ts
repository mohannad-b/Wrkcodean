import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { isDevAgentLogEnabled, sendDevAgentLog } from "@/lib/dev/agent-log";
import * as schema from "./schema";

const devLog = (payload: Record<string, unknown>) => {
  if (process.env.NODE_ENV !== "development") return;
  console.debug(
    JSON.stringify({
      channel: "agent-log",
      ...payload,
      timestamp: Date.now(),
    })
  );
};

type GlobalDbCache = {
  pgPool?: Pool;
  drizzleDb?: NodePgDatabase<typeof schema>;
};

const globalForDb = globalThis as GlobalDbCache;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("[db] DATABASE_URL is not set. Database operations will fail until configured.");
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection cannot be established
    statement_timeout: 30000, // Query timeout of 30 seconds
    query_timeout: 30000, // Query timeout of 30 seconds
  });

  pool.on("error", (err) => {
    console.error("[db] Unexpected error on idle client", err);
    devLog({
      location: "db/index.ts:28",
      message: "pool error",
      data: { error: err.message, stack: err.stack },
      sessionId: "debug-session",
      runId: "run1",
      hypothesisId: "D",
    });
  });

  pool.on("connect", () => {
    if (isDevAgentLogEnabled()) {
      console.log("[db] New client connected");
    }
    sendDevAgentLog(
      {
        location: "db/index.ts:33",
        message: "pool client connected",
        data: {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        },
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "D",
      },
      { dedupeKey: "db-pool-connect", throttleMs: 5000, sampleRate: 0.2 }
    );
  });

  pool.on("remove", () => {
    if (isDevAgentLogEnabled()) {
      console.log("[db] Client removed from pool");
    }
    sendDevAgentLog(
      {
        location: "db/index.ts:38",
        message: "pool client removed",
        data: {
          totalCount: pool.totalCount,
          idleCount: pool.idleCount,
          waitingCount: pool.waitingCount,
        },
        sessionId: "debug-session",
        runId: "run1",
        hypothesisId: "D",
      },
      { dedupeKey: "db-pool-remove", throttleMs: 5000, sampleRate: 0.2 }
    );
  });

  return pool;
}

// Initialize pool and drizzle once using global cache (dev-safe across HMR)
const pool = globalForDb.pgPool ?? createPool();
if (!globalForDb.pgPool) {
  globalForDb.pgPool = pool;
}

const drizzleDb = globalForDb.drizzleDb ?? drizzle(pool, { schema });
if (!globalForDb.drizzleDb) {
  globalForDb.drizzleDb = drizzleDb;
}

export { pool };
export const db = drizzleDb;
export type DbClient = typeof db;

