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

// Initialize pool only once using global cache
if (!globalForDb.pgPool) {
  globalForDb.pgPool = new Pool({
    connectionString,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Return an error after 10 seconds if connection cannot be established
    statement_timeout: 30000, // Query timeout of 30 seconds
    query_timeout: 30000, // Query timeout of 30 seconds
  });

  // Add error handlers for the pool - ONLY on first initialization
  globalForDb.pgPool.on("error", (err) => {
    console.error("[db] Unexpected error on idle client", err);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'db/index.ts:28',message:'pool error',data:{error:err.message,stack:err.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
  });

  globalForDb.pgPool.on("connect", () => {
    console.log("[db] New client connected");
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'db/index.ts:33',message:'pool client connected',data:{totalCount:globalForDb.pgPool?.totalCount,idleCount:globalForDb.pgPool?.idleCount,waitingCount:globalForDb.pgPool?.waitingCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
  });

  globalForDb.pgPool.on("remove", () => {
    console.log("[db] Client removed from pool");
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'db/index.ts:38',message:'pool client removed',data:{totalCount:globalForDb.pgPool?.totalCount,idleCount:globalForDb.pgPool?.idleCount,waitingCount:globalForDb.pgPool?.waitingCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
  });
}

export const pool = globalForDb.pgPool;

export const db = drizzle(pool, { schema });
export type DbClient = typeof db;

