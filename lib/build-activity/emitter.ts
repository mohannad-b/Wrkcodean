import { EventEmitter } from "events";
import type Redis from "ioredis";
import {
  BuildActivityEventSchema,
  type BuildActivityEvent,
  type BuildActivitySnapshot,
  type BuildActivityCta,
  type BuildStage,
  type BuildStatus,
} from "@/features/copilot/buildActivityContract";
import { redisPublish, redisSubscribe } from "@/lib/realtime/redis-bus";
import { logger } from "@/lib/logger";

const HISTORY_LIMIT = 12;
const DEFAULT_TTL_SECONDS = 60 * 60 * 24;
const CHANNEL_PREFIX = "build:activity:";
const REDIS_ENABLED = Boolean(process.env.REDIS_URL);

type BuildActivityRunState = {
  runId: string;
  automationVersionId: string;
  lastSeq: number;
  latest: BuildActivityEvent;
  events: BuildActivityEvent[];
  updatedAt: number;
  isTerminal: boolean;
};

const localEmitter = new EventEmitter();
const runStateById = new Map<string, BuildActivityRunState>();
const runsByAutomationId = new Map<string, string[]>();
const activeRunByAutomationId = new Map<string, string>();

let cacheClient: Redis | null = null;

function assertRedisConfigured() {
  if (process.env.NODE_ENV === "production" && !process.env.REDIS_URL) {
    throw new Error("REDIS_URL is required for build activity stream in production.");
  }
}

function getCacheClient(): Redis | null {
  if (!REDIS_ENABLED) return null;
  if (cacheClient) return cacheClient;
  try {
    const RedisCtor: any = (require("ioredis") as any).default ?? require("ioredis");
    cacheClient = new RedisCtor(process.env.REDIS_URL);
    cacheClient.on("error", (error: unknown) => {
      logger.error("[build-activity] Redis cache error", error);
    });
  } catch (error) {
    logger.error("[build-activity] Failed to init redis client", error);
    cacheClient = null;
  }
  return cacheClient;
}

function channelForRun(runId: string) {
  return `${CHANNEL_PREFIX}${runId}`;
}

function getRunState(runId: string) {
  return runStateById.get(runId) ?? null;
}

function upsertRunState(params: {
  automationVersionId: string;
  runId: string;
  event: BuildActivityEvent;
}) {
  const { automationVersionId, runId, event } = params;
  const isTerminal = event.stage === "done" || event.stage === "error" || event.status === "done" || event.status === "error";
  const previous = runStateById.get(runId);
  const events = previous ? [...previous.events, event] : [event];
  const trimmed = events.length > HISTORY_LIMIT ? events.slice(-HISTORY_LIMIT) : events;
  const nextState: BuildActivityRunState = {
    runId,
    automationVersionId,
    lastSeq: event.seq,
    latest: event,
    events: trimmed,
    updatedAt: Date.now(),
    isTerminal,
  };

  runStateById.set(runId, nextState);
  const existingRuns = runsByAutomationId.get(automationVersionId) ?? [];
  if (!existingRuns.includes(runId)) {
    runsByAutomationId.set(automationVersionId, [...existingRuns, runId]);
  }
  if (!isTerminal) {
    activeRunByAutomationId.set(automationVersionId, runId);
  } else if (activeRunByAutomationId.get(automationVersionId) === runId) {
    activeRunByAutomationId.delete(automationVersionId);
  }
}

async function persistEventToRedis(automationVersionId: string, event: BuildActivityEvent) {
  const client = getCacheClient();
  if (!client) return;
  const runId = event.runId;
  const historyKey = `build:activity:history:${runId}`;
  const lastEventKey = `build:activity:last_event:${runId}`;
  const latestRunKey = `build:activity:latest_run:${automationVersionId}`;
  const activeRunKey = `build:activity:active_run:${automationVersionId}`;

  const multi = client.multi();
  multi.lpush(historyKey, JSON.stringify(event));
  multi.ltrim(historyKey, 0, HISTORY_LIMIT - 1);
  multi.expire(historyKey, DEFAULT_TTL_SECONDS);
  multi.set(lastEventKey, JSON.stringify(event), "EX", DEFAULT_TTL_SECONDS);
  multi.set(latestRunKey, runId, "EX", DEFAULT_TTL_SECONDS);
  if (event.stage === "done" || event.stage === "error" || event.status === "done" || event.status === "error") {
    multi.del(activeRunKey);
  } else {
    multi.set(activeRunKey, runId, "EX", DEFAULT_TTL_SECONDS);
  }
  await multi.exec();
}

async function fetchRunIdFromRedis(automationVersionId: string, preferActive: boolean): Promise<string | null> {
  const client = getCacheClient();
  if (!client) return null;
  const activeRunKey = `build:activity:active_run:${automationVersionId}`;
  const latestRunKey = `build:activity:latest_run:${automationVersionId}`;
  const runId = preferActive ? await client.get(activeRunKey) : null;
  if (runId) return runId;
  return (await client.get(latestRunKey)) ?? null;
}

async function fetchSnapshotFromRedis(runId: string): Promise<BuildActivitySnapshot | null> {
  const client = getCacheClient();
  if (!client) return null;
  const historyKey = `build:activity:history:${runId}`;
  const lastEventKey = `build:activity:last_event:${runId}`;
  const [lastRaw, historyRaw] = await Promise.all([client.get(lastEventKey), client.lrange(historyKey, 0, HISTORY_LIMIT - 1)]);
  if (!lastRaw) return null;
  const latest = BuildActivityEventSchema.parse(JSON.parse(lastRaw));
  const events = Array.isArray(historyRaw)
    ? historyRaw
        .map((raw) => {
          try {
            return BuildActivityEventSchema.parse(JSON.parse(raw));
          } catch {
            return null;
          }
        })
        .filter((event): event is BuildActivityEvent => Boolean(event))
        .reverse()
    : [];

  return {
    runId,
    stage: latest.stage,
    status: latest.status,
    title: latest.title,
    detail: latest.detail,
    progress: latest.progress,
    seq: latest.seq,
    ts: new Date().toISOString(),
    cta: latest.cta,
    events,
  };
}

export function emitBuildActivity(params: {
  automationVersionId: string;
  runId: string;
  stage: BuildStage;
  status: BuildStatus;
  title: string;
  detail?: string;
  progress?: number;
  cta?: BuildActivityCta;
  ts?: string;
}): BuildActivityEvent {
  const { automationVersionId, runId, stage, status, title, detail, progress, cta } = params;
  const previous = getRunState(runId);
  const nextSeq = (previous?.lastSeq ?? 0) + 1;
  const event: BuildActivityEvent = BuildActivityEventSchema.parse({
    runId,
    stage,
    status,
    title,
    detail,
    progress,
    seq: nextSeq,
    ts: params.ts ?? new Date().toISOString(),
    cta,
  });

  upsertRunState({ automationVersionId, runId, event });
  localEmitter.emit(runId, event);

  if (REDIS_ENABLED) {
    void persistEventToRedis(automationVersionId, event).catch((error) => {
      logger.error("[build-activity] Failed to persist event", error);
    });
    void redisPublish(channelForRun(runId), { automationVersionId, event }).catch((error) => {
      logger.error("[build-activity] Failed to publish event", error);
    });
  }

  return event;
}

export async function subscribeToBuildActivity(
  runId: string,
  handler: (event: BuildActivityEvent) => void
): Promise<() => Promise<void>> {
  assertRedisConfigured();
  const localHandler = (event: BuildActivityEvent) => handler(event);
  localEmitter.on(runId, localHandler);

  if (!REDIS_ENABLED) {
    return async () => {
      localEmitter.off(runId, localHandler);
    };
  }

  const unsubscribeRedis = await redisSubscribe<{ automationVersionId?: string; event?: BuildActivityEvent }>(
    channelForRun(runId),
    (payload) => {
      if (!payload?.event) return;
      try {
        const parsed = BuildActivityEventSchema.parse(payload.event);
        const automationVersionId =
          payload.automationVersionId ?? runStateById.get(runId)?.automationVersionId ?? null;
        if (automationVersionId) {
          upsertRunState({ automationVersionId, runId, event: parsed });
        }
        handler(parsed);
      } catch (error) {
        logger.error("[build-activity] Invalid event payload", error);
      }
    }
  );

  return async () => {
    localEmitter.off(runId, localHandler);
    await unsubscribeRedis();
  };
}

export async function getBuildActivitySnapshot(params: {
  automationVersionId: string;
  runId?: string | null;
  lastSeq?: number | null;
}): Promise<BuildActivitySnapshot | null> {
  assertRedisConfigured();
  const { automationVersionId, runId: requestedRunId, lastSeq } = params;
  const runId =
    requestedRunId ??
    activeRunByAutomationId.get(automationVersionId) ??
    (runsByAutomationId.get(automationVersionId)?.slice(-1)[0] ?? null) ??
    (await fetchRunIdFromRedis(automationVersionId, true));

  if (!runId) return null;

  const localState = getRunState(runId);
  let snapshot: BuildActivitySnapshot | null = null;

  if (localState) {
    snapshot = {
      runId,
      stage: localState.latest.stage,
      status: localState.latest.status,
      title: localState.latest.title,
      detail: localState.latest.detail,
      progress: localState.latest.progress,
      seq: localState.latest.seq,
      ts: new Date().toISOString(),
      cta: localState.latest.cta,
      events: localState.events,
    };
  } else {
    snapshot = await fetchSnapshotFromRedis(runId);
  }

  if (!snapshot) return null;

  const filteredEvents =
    typeof lastSeq === "number"
      ? snapshot.events.filter((event) => event.seq > lastSeq)
      : snapshot.events;

  return {
    ...snapshot,
    events: filteredEvents,
  };
}

export async function getLatestActiveRunId(automationVersionId: string): Promise<string | null> {
  assertRedisConfigured();
  const local = activeRunByAutomationId.get(automationVersionId);
  if (local) return local;
  const fromRedis = await fetchRunIdFromRedis(automationVersionId, true);
  return fromRedis;
}
