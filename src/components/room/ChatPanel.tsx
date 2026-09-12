"use client";

import { useEffect, useRef, useState } from "react";
import { useRoomStore } from "@/stores/room-store";
import type { JobDTO } from "@/lib/events";

const ACTIVE: Array<JobDTO["status"]> = ["QUEUED", "RUNNING"];

function JobRow({ job }: { job: JobDTO }) {
  const running = job.status === "RUNNING";
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-neutral-300">{job.instruction}</span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
            running ? "bg-blue-500/15 text-blue-300" : "bg-neutral-700/50 text-neutral-400"
          }`}
        >
          {job.status}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-500">
        <span>{job.author?.displayName ?? "unknown"}</span>
        <span className="rounded bg-neutral-800 px-1 py-px">{job.strategy}</span>
      </div>
      {running && (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{ width: `${Math.max(job.progress, 5)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function ChatPanel() {
  const slug = useRoomStore((s) => s.slug);
  const sessionId = useRoomStore((s) => s.sessionId);
  const messages = useRoomStore((s) => s.messages);
  const jobs = useRoomStore((s) => s.jobs);

  const [input, setInput] = useState("");
  const [isInstruction, setIsInstruction] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const activeJobs = jobs.filter((j) => ACTIVE.includes(j.status));

  const send = async () => {
    const text = input.trim();
    if (!text || !slug || !sessionId || sending) return;

    setSending(true);
    setError(null);
    const kind = isInstruction ? "INSTRUCTION" : "CHAT";
    setInput("");

    try {
      const res = await fetch(`/api/rooms/${slug}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, body: text, kind }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to send");
      }
    } catch (err) {
      setInput(text);
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="pt-8 text-center text-xs text-neutral-600">
            Discuss the design, or switch to <em>Request change</em> to generate a new version.
          </p>
        )}

        {messages.map((m) => {
          if (m.kind === "SYSTEM") {
            return (
              <p key={m.id} className="py-1 text-center text-[11px] italic text-neutral-500">
                {m.body}
              </p>
            );
          }

          const instruction = m.kind === "INSTRUCTION";
          return (
            <div key={m.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: m.author?.color ?? "#666" }}
                />
                <span className="text-[11px] font-medium text-neutral-400">
                  {m.author?.displayName ?? "unknown"}
                </span>
                {instruction && (
                  <span className="rounded bg-blue-500/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-blue-300">
                    change
                  </span>
                )}
              </div>
              <p
                className={`ml-3.5 whitespace-pre-wrap text-sm leading-relaxed ${
                  instruction ? "text-blue-200" : "text-neutral-200"
                }`}
              >
                {m.body}
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {activeJobs.length > 0 && (
        <div className="space-y-1.5 border-t border-neutral-800 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Queue ({activeJobs.length})
          </p>
          {activeJobs.map((job) => (
            <JobRow key={job.id} job={job} />
          ))}
        </div>
      )}

      {/* min-h matches VersionTimeline's footer band (search "min-h-[110px]"
          there) so this border-t lands at the same height as the timeline's,
          across the two columns — keep both values equal if either changes. */}
      <div className="flex min-h-[110px] flex-col justify-center border-t border-neutral-800 p-3">
        <div className="mb-2 flex gap-1">
          <button
            type="button"
            onClick={() => setIsInstruction(false)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              !isInstruction
                ? "bg-neutral-700 text-white"
                : "bg-neutral-900 text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Discuss
          </button>
          <button
            type="button"
            onClick={() => setIsInstruction(true)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              isInstruction
                ? "bg-blue-600 text-white"
                : "bg-neutral-900 text-neutral-500 hover:text-neutral-300"
            }`}
          >
            Request change
          </button>
        </div>

        {error && <p className="mb-1.5 text-[11px] text-red-400">{error}</p>}

        <div className="flex items-end gap-2 rounded-xl bg-neutral-800/50 px-3 py-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={
              isInstruction ? "e.g. make the handle 15% thicker" : "Say something..."
            }
            // py-1.5 + leading-5 makes a single line exactly as tall as the send
            // button, so bottom-aligning the row reads as centred. The button
            // still sits at the bottom once the text wraps.
            className="block max-h-[120px] flex-1 resize-none bg-transparent py-1.5 text-sm leading-5 text-neutral-200 placeholder-neutral-500 outline-none"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!input.trim() || sending}
            className={`shrink-0 rounded-lg p-2 text-white transition-colors disabled:opacity-30 ${
              isInstruction ? "bg-blue-600 hover:bg-blue-500" : "bg-neutral-600 hover:bg-neutral-500"
            }`}
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
