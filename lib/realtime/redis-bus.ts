import Redis from "ioredis";
import { logger } from "@/lib/logger";

type Handler<TPayload = unknown> = (payload: TPayload) => void;

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
const channelHandlers = new Map<string, Set<Handler>>();
let subscriberBound = false;

function requireRedisUrl(): string {
  const redisUrl = process.env.REDIS_URL;
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "pre-fix",
      hypothesisId: "H-redis",
      location: "lib/realtime/redis-bus.ts:requireRedisUrl",
      message: "Checking REDIS_URL presence",
      data: {
        hasRedisUrl: Boolean(redisUrl),
        length: redisUrl?.length ?? 0,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (!redisUrl) {
    throw new Error("REDIS_URL not set for realtime events");
  }
  return redisUrl;
}

function createRedisClient(): Redis {
  const RedisCtor: any = (Redis as any).default ?? (Redis as any);
  const url = requireRedisUrl();
  try {
    return new RedisCtor(url);
  } catch {
    // Support factory-style mocks that aren't constructable
    return RedisCtor(url);
  }
}

function getPublisher(): Redis {
  if (publisher) return publisher;
  publisher = createRedisClient();
  publisher.on("error", (error) => {
    logger.error("[redis-bus] Publisher error", error);
  });
  return publisher;
}

function getSubscriber(): Redis {
  if (subscriber) return subscriber;
  subscriber = createRedisClient();
  subscriber.on("error", (error) => {
    logger.error("[redis-bus] Subscriber error", error);
  });
  return subscriber;
}

function bindSubscriber() {
  if (subscriberBound) return;
  const sub = getSubscriber();
  sub.on("message", (channel, message) => {
    const handlers = channelHandlers.get(channel);
    if (!handlers || handlers.size === 0) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch (error) {
      logger.error("[redis-bus] Failed to parse message from Redis channel", channel, error);
      return;
    }

    handlers.forEach((handler) => {
      try {
        handler(parsed);
      } catch (error) {
        logger.error("[redis-bus] Handler error", error);
      }
    });
  });
  subscriberBound = true;
}

export async function redisPublish(channel: string, payload: unknown): Promise<void> {
  const client = getPublisher();
  await client.publish(channel, JSON.stringify(payload));
}

export async function redisSubscribe<TPayload = unknown>(
  channel: string,
  handler: Handler<TPayload>
): Promise<() => Promise<void>> {
  const client = getSubscriber();
  bindSubscriber();

  let handlers = channelHandlers.get(channel);
  if (!handlers) {
    handlers = new Set();
    channelHandlers.set(channel, handlers);
    await client.subscribe(channel);
  }

  handlers.add(handler as Handler);

  return async () => {
    const currentHandlers = channelHandlers.get(channel);
    if (!currentHandlers) return;

    currentHandlers.delete(handler as Handler);

    if (currentHandlers.size === 0) {
      channelHandlers.delete(channel);
      try {
        await client.unsubscribe(channel);
      } catch (error) {
        logger.error("[redis-bus] Failed to unsubscribe from channel", channel, error);
      }
    }
  };
}

