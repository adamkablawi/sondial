import type { JobStatus } from "./types";

/**
 * Global in-memory job store that persists across Next.js API route invocations.
 *
 * In Next.js dev mode, modules can be re-evaluated between requests, which
 * causes module-level Maps to be reset. By attaching to globalThis, the store
 * survives hot-reloads and module re-instantiation.
 */

export interface StoredJob {
  status: JobStatus;
  progress: number;
  createdAt: number;
  data?: Record<string, unknown>;
}

const GLOBAL_KEY = "__itera_job_store__" as const;

function getStore(): Map<string, StoredJob> {
  const g = globalThis as unknown as Record<string, Map<string, StoredJob> | undefined>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map();
  }
  return g[GLOBAL_KEY];
}

export const jobStore = {
  set(jobId: string, job: StoredJob) {
    getStore().set(jobId, job);
  },

  get(jobId: string): StoredJob | undefined {
    return getStore().get(jobId);
  },

  delete(jobId: string) {
    getStore().delete(jobId);
  },
};
