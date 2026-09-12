import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma client singleton.
 *
 * Held on globalThis so Next dev hot-reloads and the separate worker/realtime
 * processes each reuse one pool instead of leaking connections, matching the
 * globalThis pattern already used elsewhere in this repo.
 */

const GLOBAL_KEY = "__sondial_prisma__" as const;

interface PrismaGlobal {
  [GLOBAL_KEY]?: PrismaClient;
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and start the infra (npm run infra:up).",
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const store = globalThis as unknown as PrismaGlobal;

export const db: PrismaClient = store[GLOBAL_KEY] ?? createClient();

if (process.env.NODE_ENV !== "production") {
  store[GLOBAL_KEY] = db;
}
