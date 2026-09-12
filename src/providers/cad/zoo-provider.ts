import WebSocket from "ws";
import type {
  CadGenerationInput,
  CadGenerationResult,
  CadPreview,
  CadProvider,
} from "./types";

/**
 * Zoo (zoo.dev) Zookeeper copilot.
 *
 * One turn per generation: open a socket, send the instruction along with the
 * previous version's KCL, collect the updated source, close on end_of_stream.
 *
 * Protocol notes, established by probing the live API — the OpenAPI spec alone
 * is misleading here:
 *  - The authoritative KCL arrives in `tool_output.result.outputs`, a map of
 *    path to plain text. The `files` message is something else entirely: an
 *    array of rendered preview images as byte arrays.
 *  - `current_files` must be sent as byte arrays, not strings.
 *  - REST text-to-cad creation is no longer public; this socket is the way in.
 */

const ZOO_WS_URL = process.env.ZOO_WS_URL ?? "wss://api.zoo.dev/ws/ml/copilot";
const TURN_TIMEOUT_MS = 5 * 60 * 1000;

interface ZooTurnOutcome {
  files: Record<string, string>;
  preview: CadPreview | null;
  conversationId: string | null;
  assistantText: string;
}

function isRecordOfStrings(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((v) => typeof v === "string")
  );
}

export class ZooProvider implements CadProvider {
  readonly name = "zoo";
  readonly kind = "source" as const;

  private token: string;

  constructor() {
    this.token = process.env.ZOO_API_KEY ?? process.env.ZOO_API_TOKEN ?? "";
    if (!this.token) {
      console.warn("[ZooProvider] ZOO_API_KEY not set — calls will fail.");
    }
  }

  async generate(input: CadGenerationInput): Promise<CadGenerationResult> {
    // With prior source the instruction is applied to it directly; without,
    // the compiled prompt describes the object from scratch.
    const editing = Boolean(input.previousSource?.trim());
    const content = editing ? input.instruction : input.prompt;

    const outcome = await this.runTurn({
      content,
      currentFiles: editing ? { "main.kcl": input.previousSource as string } : undefined,
      onProgress: input.onProgress,
    });

    const sourcePath =
      Object.keys(outcome.files).find((f) => f.endsWith(".kcl")) ??
      Object.keys(outcome.files)[0];

    if (!sourcePath) {
      throw new Error(
        outcome.assistantText
          ? `Zoo returned no CAD source. It replied: ${outcome.assistantText.slice(0, 300)}`
          : "Zoo returned no CAD source.",
      );
    }

    return {
      source: outcome.files[sourcePath],
      sourcePath,
      preview: outcome.preview ?? undefined,
      externalId: outcome.conversationId ?? undefined,
    };
  }

  private runTurn(args: {
    content: string;
    currentFiles?: Record<string, string>;
    onProgress?: (percent: number) => void | Promise<void>;
  }): Promise<ZooTurnOutcome> {
    return new Promise<ZooTurnOutcome>((resolve, reject) => {
      if (!this.token) {
        reject(new Error("ZOO_API_KEY is not set."));
        return;
      }

      const socket = new WebSocket(ZOO_WS_URL, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      let files: Record<string, string> = {};
      let preview: CadPreview | null = null;
      let conversationId: string | null = null;
      let assistantText = "";
      let settled = false;
      // The vendor gives no percentage, so progress is inferred from activity
      // and capped below 100 until the turn actually ends.
      let ticks = 0;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          socket.close();
        } catch {
          // already closing
        }
        fn();
      };

      const timer = setTimeout(
        () => finish(() => reject(new Error(`Zoo turn timed out after ${TURN_TIMEOUT_MS / 1000}s`))),
        TURN_TIMEOUT_MS,
      );

      socket.on("open", () => {
        const message: Record<string, unknown> = {
          type: "user",
          content: args.content,
          project_name: "sondial",
        };
        if (args.currentFiles) {
          message.current_files = Object.fromEntries(
            Object.entries(args.currentFiles).map(([path, text]) => [
              path,
              Array.from(Buffer.from(text, "utf8")),
            ]),
          );
        }
        socket.send(JSON.stringify(message));
      });

      socket.on("message", (raw: WebSocket.RawData) => {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(raw.toString()) as Record<string, unknown>;
        } catch {
          return;
        }

        const kind = (parsed.type as string) ?? Object.keys(parsed)[0];
        const body = (parsed[kind] ?? parsed) as Record<string, unknown>;

        ticks += 1;
        if (args.onProgress && ticks % 5 === 0) {
          void args.onProgress(Math.min(90, 10 + ticks));
        }

        switch (kind) {
          case "conversation_id":
            conversationId = (body.conversation_id as string) ?? null;
            break;

          case "delta":
            if (typeof body.delta === "string") assistantText += body.delta;
            break;

          case "tool_output": {
            const result = body.result as Record<string, unknown> | undefined;
            if (result && isRecordOfStrings(result.outputs)) {
              files = result.outputs;
            }
            break;
          }

          case "files": {
            // Rendered stills. Prefer the multi-view render when offered.
            const list = body.files as
              | Array<{ name?: string; mimetype?: string; data?: number[] }>
              | undefined;
            if (!Array.isArray(list)) break;
            for (const file of list) {
              if (!file?.data || !file.mimetype?.startsWith("image/")) continue;
              const candidate: CadPreview = {
                data: Buffer.from(file.data),
                mimetype: file.mimetype,
              };
              if (!preview || file.name?.includes("four")) preview = candidate;
            }
            break;
          }

          case "error":
            finish(() =>
              reject(new Error(`Zoo error: ${(body.detail as string) ?? JSON.stringify(body)}`)),
            );
            break;

          case "access_denied":
            finish(() =>
              reject(
                new Error(
                  `Zoo access denied (${body.code ?? "unknown"}): ${body.detail ?? "check ZOO_API_KEY"}`,
                ),
              ),
            );
            break;

          case "end_of_stream":
            finish(() => resolve({ files, preview, conversationId, assistantText }));
            break;
        }
      });

      socket.on("error", (err: Error) =>
        finish(() => reject(new Error(`Zoo socket error: ${err.message}`))),
      );

      socket.on("close", () => {
        // A close without end_of_stream means the turn was cut short.
        finish(() =>
          Object.keys(files).length
            ? resolve({ files, preview, conversationId, assistantText })
            : reject(new Error("Zoo closed the connection before returning any CAD source.")),
        );
      });
    });
  }
}
