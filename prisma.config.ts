import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Mirror server/env.ts: .env.local overrides .env. Without this the Prisma
// CLI misses a DATABASE_URL that lives only in .env.local, while the app and
// worker — which do read it — connect fine, making the CLI look mysteriously
// misconfigured.
config({ path: ".env" });
config({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
