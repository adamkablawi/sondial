import "./env";
import { createServer } from "node:http";
import httpProxy from "http-proxy";

/**
 * Collapses the app (:3000) and the realtime server (:3001) behind one port,
 * so a single ngrok tunnel — or any single-origin host — can reach both.
 *
 * This exists because ngrok's free tier issues one shared dev domain per
 * account, not one subdomain per tunnel (a platform change from its older
 * behavior, confirmed directly against a real account before building this:
 * two separately-tunneled ports came back with the identical public URL).
 * Two origins was never going to work on the free tier regardless of how
 * this proxy is built.
 *
 * Socket.IO defaults to the `/socket.io` path on both client and server, so
 * that prefix is the routing key — no client-side path configuration exists
 * to keep in sync. WebSocket upgrades are handled separately from normal HTTP
 * requests (Node's http server emits a distinct "upgrade" event); an
 * http-proxy instance forwards each the same way once both are wired.
 */

const PORT = Number(process.env.TUNNEL_PROXY_PORT ?? 3002);
// 3000 is hardcoded, not env-configurable: unlike REALTIME_PORT, no such
// variable exists elsewhere in this codebase for the Next app's own port.
const APP_TARGET = "http://localhost:3000";
const REALTIME_TARGET = `http://localhost:${process.env.REALTIME_PORT ?? 3001}`;

function targetFor(url: string | undefined): string {
  return url?.startsWith("/socket.io") ? REALTIME_TARGET : APP_TARGET;
}

const proxy = httpProxy.createProxyServer({ ws: true });
proxy.on("error", (err, _req, res) => {
  console.error("[tunnel-proxy] proxy error:", err.message);
  if (res && "writeHead" in res && !res.headersSent) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Bad gateway (upstream not reachable)");
  }
});

const server = createServer((req, res) => {
  proxy.web(req, res, { target: targetFor(req.url) });
});

server.on("upgrade", (req, socket, head) => {
  proxy.ws(req, socket, head, { target: targetFor(req.url) });
});

server.listen(PORT, () => {
  console.log(`[tunnel-proxy] listening on :${PORT} -> app ${APP_TARGET}, realtime ${REALTIME_TARGET}`);
});
