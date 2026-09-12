/**
 * Client for Zoo's ML copilot websocket (`/ws/ml/copilot`).
 *
 * Zoo retired the REST Text-to-CAD create endpoint — `POST /ai/text-to-cad/*`
 * now 404s, while protected routes 401, so the routes are genuinely gone rather
 * than merely unauthorized. Generation goes through this websocket, which runs
 * an agent ("Zookeeper") that writes **KCL source** into a project.
 *
 * That is the important difference from a mesh vendor: the artifact is code,
 * not geometry. Geometry comes back separately, via the Text-to-CAD record the
 * generation produces (see `zoo-provider.ts`).
 *
 * Protocol notes that are easy to get wrong:
 *   - Auth is a `headers` message sent *after* connecting, not a connect-time
 *     header — browsers cannot set headers on a websocket handshake, so Zoo
 *     moved it into the stream.
 *   - A ping/pong heartbeat every ~5s is mandatory or the server closes the
 *     connection mid-generation.
 *   - Server messages are single-key objects (`{delta: ...}`, `{files: ...}`),
 *     not tagged with a `type` field the way client messages are.
 */

const ZOO_WS_URL = process.env.ZOO_WS_URL ?? "wss://api.zoo.dev/ws/ml/copilot";
const HEARTBEAT_MS = 5000;

export interface ZooGenerationResult {
  /** KCL files the agent wrote, keyed by project-relative path. */
  files: Record<string, string>;
  /** Concatenated assistant text (explanations, not code). */
  text: string;
  /** Groups prompts; needed to find the Text-to-CAD record afterwards. */
  conversationId: string | null;
}

export interface ZooRunOptions {
  prompt: string;
  /** Existing KCL to iterate on. Absent for a first generation. */
  currentFiles?: Record<string, string>;
  projectName?: string;
  signal?: AbortSignal;
  /** Hard ceiling on one generation. */
  timeoutMs?: number;
  onProgress?: (note: string) => void;
}

/** Thrown for a refusal or a protocol-level failure, never for a clean empty result. */
export class ZooError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "ZooError";
  }
}

export async function runZooCopilot(opts: ZooRunOptions): Promise<ZooGenerationResult> {
  const apiKey = process.env.ZOO_API_KEY;
  if (!apiKey) throw new ZooError("ZOO_API_KEY is not set");

  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;

  return new Promise<ZooGenerationResult>((resolve, reject) => {
    const ws = new WebSocket(ZOO_WS_URL);

    const files: Record<string, string> = {};
    let text = "";
    let conversationId: string | null = null;
    let settled = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let sawPong = true;

    const cleanup = () => {
      if (heartbeat) clearInterval(heartbeat);
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      try {
        ws.close();
      } catch {
        // Already closing; nothing to do.
      }
    };

    const finish = (result: ZooGenerationResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const timer = setTimeout(
      () => fail(new ZooError(`Zoo generation exceeded ${timeoutMs}ms`, "timeout")),
      timeoutMs,
    );

    const onAbort = () => fail(new ZooError("Zoo generation aborted", "aborted"));
    opts.signal?.addEventListener("abort", onAbort);

    const send = (msg: unknown) => ws.send(JSON.stringify(msg));

    ws.addEventListener("open", () => {
      // Authenticate first — anything sent before this is rejected.
      send({ type: "headers", headers: { Authorization: `Bearer ${apiKey}` } });

      send({
        type: "user",
        content: opts.prompt,
        ...(opts.projectName ? { project_name: opts.projectName } : {}),
        ...(opts.currentFiles ? { current_files: opts.currentFiles } : {}),
      });

      heartbeat = setInterval(() => {
        // A missed pong means the connection is a zombie: fail rather than hang
        // until the overall timeout.
        if (!sawPong) {
          fail(new ZooError("Zoo websocket stopped responding to pings", "heartbeat"));
          return;
        }
        sawPong = false;
        try {
          send({ type: "ping" });
        } catch {
          // The close handler will settle this.
        }
      }, HEARTBEAT_MS);
    });

    ws.addEventListener("message", (event) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
      } catch {
        return; // Ignore anything unparseable rather than killing the run.
      }

      if ("pong" in msg) {
        sawPong = true;
        return;
      }

      if ("conversation_id" in msg) {
        const c = msg.conversation_id as { conversation_id?: string } | string;
        conversationId = typeof c === "string" ? c : (c?.conversation_id ?? null);
        return;
      }

      if ("delta" in msg) {
        const d = msg.delta as { delta?: string } | string;
        text += typeof d === "string" ? d : (d?.delta ?? "");
        return;
      }

      if ("reasoning" in msg || "tool_output" in msg) {
        opts.onProgress?.(Object.keys(msg)[0]);
        return;
      }

      if ("files" in msg) {
        // Shape: { files: { files: [{ name, content }] } } — tolerate both a
        // list of entries and a plain path->content map.
        const payload = (msg.files as { files?: unknown })?.files ?? msg.files;
        if (Array.isArray(payload)) {
          for (const f of payload as Array<{ name?: string; content?: string }>) {
            if (f?.name) files[f.name] = f.content ?? "";
          }
        } else if (payload && typeof payload === "object") {
          for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
            if (typeof v === "string") files[k] = v;
          }
        }
        return;
      }

      if ("error" in msg) {
        const e = msg.error as { detail?: string; message?: string } | string;
        fail(
          new ZooError(
            typeof e === "string" ? e : (e?.detail ?? e?.message ?? "Zoo returned an error"),
            "error",
          ),
        );
        return;
      }

      if ("access_denied" in msg) {
        const a = msg.access_denied as { code?: string; detail?: string };
        fail(new ZooError(a?.detail ?? "Zoo denied access", a?.code ?? "access_denied"));
        return;
      }

      if ("end_of_stream" in msg) {
        const eos = msg.end_of_stream as { whole_response?: string } | undefined;
        if (eos?.whole_response && !text) text = eos.whole_response;
        finish({ files, text, conversationId });
      }
    });

    ws.addEventListener("error", () => {
      fail(new ZooError("Zoo websocket connection failed", "connection"));
    });

    ws.addEventListener("close", (event) => {
      // A close before end_of_stream is a truncated generation, not a success.
      if (!settled) {
        fail(
          new ZooError(
            `Zoo websocket closed before finishing (code ${(event as CloseEvent).code ?? "?"})`,
            "closed",
          ),
        );
      }
    });
  });
}
