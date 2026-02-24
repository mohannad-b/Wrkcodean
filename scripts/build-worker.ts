import dotenv from "dotenv";

// Load env FIRST
dotenv.config({ path: ".env.local", override: true });
dotenv.config({ path: ".env", override: true });
dotenv.config({ override: true });

function redactRedis(url?: string) {
  if (!url) return "MISSING";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}:${u.port || ""}`.replace(/:$/, "");
  } catch {
    return "INVALID_URL";
  }
}

// Quick sanity (temporary)
console.log("[build-worker env]", {
  NODE_ENV: process.env.NODE_ENV,
  APP_ENV: process.env.APP_ENV,
  DATABASE_URL: process.env.DATABASE_URL ? "SET" : "MISSING",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "SET" : "MISSING",
  REDIS_URL: redactRedis(process.env.REDIS_URL),
});

async function main() {
  // Import ONLY after dotenv is loaded
  const [{ getBuildQueue, getBuildWorker, getQueueEvents, ensureQueueScheduler }, { runBuildPipeline }, { logger }] =
    await Promise.all([
    import("@/lib/build-activity/build-queue"),
    import("@/lib/build-activity/build-runner"),
    import("@/lib/logger"),
  ]);

  await ensureQueueScheduler();
  await getBuildQueue();

  const worker = await getBuildWorker(async (job) => {
    try {
      console.log("[build-worker] picked up job", { jobId: job.id, runId: job.data.runId });
      await runBuildPipeline(job.data);
    } catch (error) {
      logger.error("[build-worker] Job failed", error);
      throw error;
    }
  });

  worker.on("ready", () => console.log("[build-worker] ready event"));
  worker.on("error", (error) => console.error("[build-worker] error", error));
  worker.on("active", (job) => {
    console.log("[build-worker] active", { jobId: job?.id ?? null, runId: (job?.data as any)?.runId ?? null });
  });
  worker.on("failed", (job, err) => {
    console.error("[build-worker] failed", { jobId: job?.id ?? null, error: err?.message ?? String(err) });
  });
  worker.on("completed", (job) => {
    console.log("[build-worker] completed", { jobId: job?.id ?? null });
  });
  worker.on("stalled", (jobId) => {
    console.warn("[build-worker] stalled", { jobId });
  });

  const queueEvents = await getQueueEvents();
  queueEvents.on("completed", ({ jobId }) => console.log("[build-queue-events] completed", { jobId }));
  queueEvents.on("failed", ({ jobId, failedReason }) =>
    console.error("[build-queue-events] failed", { jobId, failedReason })
  );
  queueEvents.on("stalled", ({ jobId }) => console.warn("[build-queue-events] stalled", { jobId }));

  await worker.waitUntilReady();
  console.log("[build-worker] ready");

  console.log("Build worker started");
}

main().catch((err) => {
  console.error("Build worker failed to start", err);
  process.exit(1);
});