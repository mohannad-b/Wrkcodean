// Thin wrapper around BullMQ queue wiring. This is intentionally minimal to avoid
// adding hard dependencies until BullMQ is installed in the project.

type BullModule = typeof import("bullmq");

let bull: BullModule | undefined;

async function loadBull(): Promise<BullModule> {
  if (bull) return bull;
  bull = await import("bullmq");
  return bull;
}

export async function getEmailQueue() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL not set for email queue");
  }

  const { Queue } = await loadBull();
  return new Queue("email:send", {
    connection: { url: redisUrl },
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: "exponential", delay: 30000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
}

export async function getEmailWorker(
  handler: (job: { data: unknown; opts: { attemptsMade: number } }) => Promise<void>
) {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL not set for email queue");
  }

  const { Worker } = await loadBull();
  return new Worker(
    "email:send",
    async (job) => {
      await handler({ data: job.data, opts: { attemptsMade: job.attemptsMade } });
    },
    { connection: { url: redisUrl } }
  );
}

