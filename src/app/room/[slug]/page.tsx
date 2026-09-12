"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ModelViewer } from "@/components/viewer/ModelViewer";
import { ChatPanel } from "@/components/room/ChatPanel";
import { DesignStatePanel } from "@/components/room/DesignStatePanel";
import { PresenceBar } from "@/components/room/PresenceBar";
import { VersionTimeline } from "@/components/room/VersionTimeline";
import { useRoomSocket } from "@/hooks/useRoomSocket";
import { useActiveVersion, useRoomStore } from "@/stores/room-store";

type MeshFormat = "obj" | "glb" | "stl" | "fbx";

function asMeshFormat(value: string | null): MeshFormat | null {
  return value === "obj" || value === "glb" || value === "stl" || value === "fbx"
    ? value
    : null;
}

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? null;

  const sessionId = useRoomStore((s) => s.sessionId);
  const storedName = useRoomStore((s) => s.displayName);
  const setIdentity = useRoomStore((s) => s.setIdentity);
  const hydrate = useRoomStore((s) => s.hydrate);
  const roomName = useRoomStore((s) => s.roomName);
  const selectedVersionId = useRoomStore((s) => s.selectedVersionId);
  const headVersionId = useRoomStore((s) => s.headVersionId);

  const activeVersion = useActiveVersion();

  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useRoomSocket(joined ? slug : null, joined ? sessionId : null);

  const join = useCallback(
    async (displayName: string) => {
      if (!slug) return;
      setJoining(true);
      setError(null);
      try {
        const res = await fetch(`/api/rooms/${slug}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName, sessionId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not join");

        setIdentity(data.sessionId, data.participant.displayName);

        const snapshot = await fetch(`/api/rooms/${slug}`);
        if (snapshot.ok) hydrate(await snapshot.json());

        setJoined(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not join");
      } finally {
        setJoining(false);
      }
    },
    [slug, sessionId, setIdentity, hydrate],
  );

  // Returning visitors rejoin automatically and keep their attribution.
  useEffect(() => {
    if (!joined && !joining && storedName && sessionId) void join(storedName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedName, sessionId]);

  if (!joined) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">Join the review</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Pick a name others in the room will see.
            </p>
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && name.trim() && void join(name.trim())}
            placeholder="Your name"
            autoFocus
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900/50 px-4 py-3 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-neutral-500"
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="button"
            onClick={() => name.trim() && void join(name.trim())}
            disabled={!name.trim() || joining}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
          >
            {joining ? "Joining..." : "Join room"}
          </button>
        </div>
      </main>
    );
  }

  const viewingHistory = selectedVersionId !== null && selectedVersionId !== headVersionId;

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <div>
            <h1 className="text-sm font-semibold text-white">{roomName ?? "Room"}</h1>
            <p className="text-[11px] text-neutral-500">{slug}</p>
          </div>
        </div>
        <PresenceBar />
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 shrink-0 overflow-hidden border-r border-neutral-800 bg-neutral-950">
          <DesignStatePanel />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            {activeVersion?.meshUrl ? (
              <ModelViewer
                modelUrl={activeVersion.meshUrl}
                modelFormat={asMeshFormat(activeVersion.meshFormat)}
                selectedPartId={null}
                onPartSelect={() => {}}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <div className="max-w-xs">
                  <p className="text-sm text-neutral-400">
                    {activeVersion?.status === "GENERATING"
                      ? "Generating this version..."
                      : "No geometry yet."}
                  </p>
                  <p className="mt-1 text-xs text-neutral-600">
                    Switch the chat to <em>Request change</em> and describe what you want.
                  </p>
                </div>
              </div>
            )}

            {viewingHistory && (
              <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-medium text-amber-300 ring-1 ring-amber-500/30">
                Viewing v{activeVersion?.versionNumber} — not the latest
              </div>
            )}
          </div>

          <VersionTimeline />
        </section>

        <aside className="flex w-80 shrink-0 flex-col border-l border-neutral-800 bg-neutral-950">
          <ChatPanel />
        </aside>
      </div>
    </main>
  );
}
