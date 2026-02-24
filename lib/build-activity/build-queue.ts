import Redis from "ioredis";

type BullModule = typeof import("bullmq");

let bull: BullModule | undefined;
let queueSchedulerReady: Promise<void> | null = null;

async function loadBull(): Promise<BullModule> {
  if (bull) return bull;
  bull = await import("bullmq");
  return bull;
}

const QUEUE_NAME = "copilot-build";
// BullMQ's Redis type can drift depending on ioredis resolution; keep this untyped.
let sharedConnection: any | null = null;

function getRedisConnection(): any {
  if (sharedConnection) return sharedConnection;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("REDIS_URL not set for build queue");
  }
  const useTls = redisUrl.startsWith("rediss://");
  sharedConnection = new Redis(redisUrl, {
    tls: useTls ? {} : undefined,
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  });
  sharedConnection.on("connect", () => {
    console.log("[redis] connected");
  });
  sharedConnection.on("error", (error: unknown) => {
    console.error("[redis] error", error);
  });
  return sharedConnection;
}

function getBullConnection(): any {
  return getRedisConnection();
}

async function ensureQueueScheduler() {
  if (queueSchedulerReady) return queueSchedulerReady;
  queueSchedulerReady = loadBull()
    .then((mod) => {
      const QueueSchedulerCtor = (mod as any).QueueScheduler ?? (mod as any).default?.QueueScheduler;
      const JobSchedulerCtor = (mod as any).JobScheduler ?? (mod as any).default?.JobScheduler;
      const SchedulerCtor = QueueSchedulerCtor ?? JobSchedulerCtor;
      if (!SchedulerCtor) {
        throw new Error("QueueScheduler/JobScheduler not available in bullmq module");
      }
      const scheduler = new SchedulerCtor(QUEUE_NAME, { connection: getBullConnection() });
      if (QueueSchedulerCtor) {
        console.log("[build-queue] scheduler initialized");
      } else {
        console.log("[build-queue] job scheduler initialized");
      }
      if (typeof scheduler.on === "function") {
        scheduler.on("ready", () => console.log("[build-queue] scheduler ready"));
        scheduler.on("error", (error: unknown) => console.error("[build-queue] scheduler error", error));
      }
    })
    .catch((error) => {
      console.error("[build-queue] scheduler init failed", error);
      queueSchedulerReady = null;
      throw error;
    });
  return queueSchedulerReady;
}

export type BuildJobData = {
  automationVersionId: string;
  runId: string;
  payload: {
    content: string;
    intakeNotes?: string | null;
    snippets?: string[];
    clientMessageId?: string;
    runId?: string;
    /** When true, API already created user + assistant messages; worker skips chat reply path */
    chatReplyHandledByApi?: boolean;
    /** When chatReplyHandledByApi, the API-created assistant message id for the worker to use */
    assistantMessageId?: string;
    /** User message id for stale-job detection; worker skips if latest user message !== this */
    userMessageId?: string;
  };
  session: {
    tenantId: string;
    userId: string;
  };
};

export function buildJobId(automationVersionId: string, runId: string) {
  return `copilot-build-${automationVersionId}-${runId}`;
}

export async function getBuildQueue() {
  await ensureQueueScheduler();
  const { Queue } = await loadBull();
  return new Queue<BuildJobData>(QUEUE_NAME, {
    connection: getBullConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 30000 },
      removeOnComplete: true,
      removeOnFail: false,
    },
  });
}

export async function getBuildWorker(
  handler: (job: { id?: string; data: BuildJobData; opts: { attemptsMade: number } }) => Promise<void>
) {
  await ensureQueueScheduler();
  const { Worker } = await loadBull();
  return new Worker(
    QUEUE_NAME,
    async (job) => {
      await handler({
        id: job.id ?? undefined,
        data: job.data as BuildJobData,
        opts: { attemptsMade: job.attemptsMade },
      });
    },
    { connection: getBullConnection(), concurrency: 1 }
  );
}

export async function getQueueEvents() {
  const { QueueEvents } = await loadBull();
  return new QueueEvents(QUEUE_NAME, { connection: getBullConnection() });
}

export { ensureQueueScheduler };
