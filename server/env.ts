import { config } from "dotenv";

/**
 * Mirrors Next's env precedence for the standalone processes:
 * real shell environment > .env.local > .env
 *
 * Without this the worker would miss provider keys that live in .env.local,
 * and silently fall back to mock generation.
 */

const fromShell = { ...process.env };

config({ path: ".env" });
config({ path: ".env.local", override: true });

// A variable genuinely set in the shell outranks both files.
for (const [key, value] of Object.entries(fromShell)) {
  if (value !== undefined) process.env[key] = value;
}
