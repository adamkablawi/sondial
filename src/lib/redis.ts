import Redis from "ioredis";

/**
 * Redis connection factories.
 *
 * Three distinct roles, because Redis semantics force the split:
 *  - queue:      BullMQ requires `maxRetriesPerRequest: null`
 *  - publisher:  ordinary command connection
 *  - subscriber: a subscribed connection cannot issue other commands
 */

function url(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6380";
}

export function createQueueConnection(): Redis {
  return new Redis(url(), { maxRetriesPerRequest: null });
}

export function createSubscriber(): Redis {
  return new Redis(url());
}

const GLOBAL_KEY = "__sondial_redis_pub__" as const;

interface RedisGlobal {
  [GLOBAL_KEY]?: Redis;
}

const store = globalThis as unknown as RedisGlobal;

/** Shared publisher — safe to reuse, unlike a subscriber connection. */
export const publisher: Redis = store[GLOBAL_KEY] ?? new Redis(url());

if (process.env.NODE_ENV !== "production") {
  store[GLOBAL_KEY] = publisher;
}
