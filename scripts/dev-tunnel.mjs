#!/usr/bin/env node
/**
 * Makes the whole stack reachable from anywhere via ngrok.
 *
 * ngrok's free tier issues ONE shared dev domain per account, not one
 * subdomain per tunnel — confirmed directly against a real account before
 * building this (two separately-tunneled ports came back with the identical
 * public URL). So this tunnels a single port: server/tunnel-proxy.ts, which
 * routes /socket.io traffic (including the websocket upgrade) to the realtime
 * server and everything else to the Next app, collapsing both local services
 * behind one origin. Verified end-to-end before wiring ngrok in at all — a
 * real Socket.IO connection through the proxy correctly used the websocket
 * transport, not a polling fallback, and a chat message round-tripped.
 *
 * Sequencing matters: NEXT_PUBLIC_REALTIME_URL has to be in .env.local
 * *before* `next dev` starts (Next.js bakes NEXT_PUBLIC_* vars in at its own
 * startup, not on every request), but the tunnel URL is only known once ngrok
 * is already up. So: start the proxy -> start ngrok -> learn the URL -> write
 * it -> only then hand off to the normal, unmodified `npm run dev`. Nothing
 * about the existing dev workflow changes; this is a prerequisite step in
 * front of it.
 *
 * The env write is undone on exit. Leaving a dead tunnel URL sitting in
 * .env.local would silently break the next plain `npm run dev` — a class of
 * bug this project has already hit more than once with stale config.
 */

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const PROXY_PORT = process.env.TUNNEL_PROXY_PORT ?? "3002";
const ENV_LOCAL = ".env.local";
const VAR_NAME = "NEXT_PUBLIC_REALTIME_URL";

const children = [];
function track(child) {
  children.push(child);
  return child;
}

function killAll() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

// ── Capture .env.local's current state for VAR_NAME, to restore verbatim on exit ──
function readEnvLines() {
  return existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, "utf8").split("\n") : [];
}

const originalLines = readEnvLines();
const originalIndex = originalLines.findIndex((l) => l.trimStart().startsWith(`${VAR_NAME}=`));
const originalLine = originalIndex >= 0 ? originalLines[originalIndex] : null;

function setEnvVar(value) {
  const lines = readEnvLines();
  const idx = lines.findIndex((l) => l.trimStart().startsWith(`${VAR_NAME}=`));
  const line = `${VAR_NAME}=${value}`;
  if (idx >= 0) lines[idx] = line;
  else lines.push(line);
  writeFileSync(ENV_LOCAL, lines.join("\n"));
}

function restoreEnvVar() {
  const lines = readEnvLines();
  const idx = lines.findIndex((l) => l.trimStart().startsWith(`${VAR_NAME}=`));
  if (idx < 0) return;
  if (originalLine !== null) {
    lines[idx] = originalLine;
  } else {
    lines.splice(idx, 1);
  }
  writeFileSync(ENV_LOCAL, lines.join("\n"));
  console.log(`\n[dev-tunnel] restored ${ENV_LOCAL} — ${originalLine !== null ? "put your prior value back" : "removed the tunnel URL"}.`);
}

process.on("SIGINT", () => {
  restoreEnvVar();
  killAll();
  process.exit(0);
});
process.on("SIGTERM", () => {
  restoreEnvVar();
  killAll();
  process.exit(0);
});

// ── 1. Proxy ──
console.log(`[dev-tunnel] starting the proxy on :${PROXY_PORT}...`);
track(
  spawn("npx", ["tsx", "server/tunnel-proxy.ts"], {
    stdio: "inherit",
    env: { ...process.env, TUNNEL_PROXY_PORT: PROXY_PORT },
  }),
);
await new Promise((r) => setTimeout(r, 1500));

// ── 2. ngrok, tunneling only the proxy ──
console.log("[dev-tunnel] starting ngrok...");
track(spawn("ngrok", ["http", PROXY_PORT, "--log", "stdout"], { stdio: "ignore" }));

// ── 3. Poll ngrok's local API for the assigned URL ──
let publicUrl = null;
for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const res = await fetch("http://127.0.0.1:4040/api/tunnels");
    const data = await res.json();
    const tunnel = data.tunnels?.find((t) => t.proto === "https");
    if (tunnel) {
      publicUrl = tunnel.public_url;
      break;
    }
  } catch {
    // ngrok's local API isn't up yet — keep polling.
  }
}

if (!publicUrl) {
  console.error("[dev-tunnel] ngrok did not report a public URL after 30s. Is it authenticated? (ngrok config check)");
  killAll();
  process.exit(1);
}

// ── 3.5 Sanity-check the free-tier browser-warning interstitial against a
// real static asset, so AR (which fetches the GLB with no browser involved,
// and can't be made to click through a warning page) fails loudly here
// rather than silently in the field. ──
let interstitialWarning = false;
try {
  const res = await fetch(`${publicUrl}/samples/mock.glb`, {
    headers: { "User-Agent": "sondial-tunnel-check/1.0" },
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) interstitialWarning = true;
} catch {
  // Non-fatal — the tunnel might just need another moment; not worth blocking on.
}

// ── 4. Point the app at the tunnel before it starts ──
setEnvVar(publicUrl);

console.log(`
┌─────────────────────────────────────────────────────────────
│  Public URL:  ${publicUrl}
│  Share this — it reaches this machine from anywhere.
${interstitialWarning ? "│\n│  ⚠ ngrok's free-tier warning page intercepted a raw asset\n│    fetch — AR (which can't click through it) will likely\n│    break on a first-time visitor. A human opening the link\n│    in a browser once first should clear it for ~7 days.\n" : ""}└─────────────────────────────────────────────────────────────
`);

// ── 5. Hand off to the normal, unmodified dev stack ──
const dev = track(spawn("npm", ["run", "dev"], { stdio: "inherit" }));
dev.on("exit", (code) => {
  restoreEnvVar();
  killAll();
  process.exit(code ?? 0);
});
