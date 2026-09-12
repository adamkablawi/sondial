import { Queue } from "bullmq";
import { createQueueConnection } from "./redis";

export const GENERATION_QUEUE = "sondial-generation";

/**
 * Deliberately minimal: only the job row id travels through Redis. The worker
 * re-reads everything from Postgres, so a job can never act on a stale snapshot
 * of the design that was captured at enqueue time.
 */
export interface GenerationJobPayload {
  jobId: string;
  roomSlug: string;
}

const GLOBAL_KEY = "__sondial_generation_queue__" as const;

interface QueueGlobal {
  [GLOBAL_KEY]?: Queue<GenerationJobPayload>;
}

const store = globalThis as unknown as QueueGlobal;

function createQueue(): Queue<GenerationJobPayload> {
  return new Queue<GenerationJobPayload>(GENERATION_QUEUE, {
    connection: createQueueConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 200 },
    },
  });
}

export const generationQueue: Queue<GenerationJobPayload> =
  store[GLOBAL_KEY] ?? createQueue();

if (process.env.NODE_ENV !== "production") {
  store[GLOBAL_KEY] = generationQueue;
}
