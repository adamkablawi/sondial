import { config } from "dotenv";

/**
 * Env loading for the worker and the verify scripts.
 *
 * Next.js reads `.env.local` automatically, but plain `dotenv/config` reads
 * only `.env` — so a single source of truth needs both. dotenv never
 * overwrites a variable that is already set, so listing `.env.local` first
 * gives it priority, and a real process env (Vultr, CI) beats both.
 */
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
