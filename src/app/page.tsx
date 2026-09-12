"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface RoomSummary {
  slug: string;
  name: string;
  createdAt: string;
  participants: number;
  messages: number;
  versions: number;
}

export default function HomePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [constraints, setConstraints] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinSlug, setJoinSlug] = useState("");

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);
  const [closingSlug, setClosingSlug] = useState<string | null>(null);

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/rooms");
      if (res.ok) setRooms((await res.json()).rooms);
    } catch {
      // Room list is non-critical; creating or joining still works without it.
    }
  }, []);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  const closeRoom = useCallback(async (slug: string) => {
    setClosingSlug(slug);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${slug}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not close the room");
      }
      setRooms((list) => list.filter((room) => room.slug !== slug));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close the room");
    } finally {
      setClosingSlug(null);
      setConfirmSlug(null);
    }
  }, []);

  const create = async () => {
    if (!name.trim() || !brief.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          brief: brief.trim(),
          constraints: constraints.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the room");
      router.push(`/room/${data.roomSlug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the room");
      setCreating(false);
    }
  };

  return (
    <main className="flex min-h-screen justify-center px-6 pb-20 pt-16">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center justify-between border-b border-neutral-800 pb-4">
          <span className="font-mono text-sm text-neutral-300">sondial</span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-600">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
            local
          </span>
        </div>

        <h1 className="text-lg font-medium text-neutral-100">New review room</h1>
        <p className="mt-1 text-xs leading-relaxed text-neutral-500">
          Describe the object once. Everyone in the room iterates from there.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-neutral-500">
              name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Insulated travel mug"
              className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none transition-colors focus:border-neutral-600"
            />
          </div>

          <div>
            <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-neutral-500">
              brief
            </label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              placeholder="A 400ml double-walled stainless steel travel mug with a tapered body, silicone grip, and a screw-on lid."
              className="w-full resize-none rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none transition-colors focus:border-neutral-600"
            />
          </div>

          <div>
            <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-neutral-500">
              constraints <span className="normal-case text-neutral-700">optional</span>
            </label>
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              rows={2}
              placeholder="Injection-moulded, 2mm minimum wall thickness."
              className="w-full resize-none rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none transition-colors focus:border-neutral-600"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="button"
            onClick={() => void create()}
            disabled={!name.trim() || !brief.trim() || creating}
            className="w-full rounded-md bg-neutral-100 py-2.5 text-sm font-medium text-neutral-950 transition-colors hover:bg-white disabled:opacity-30"
          >
            {creating ? "Creating…" : "Create room"}
          </button>
        </div>

        <div className="mt-8 border-t border-neutral-800 pt-6">
          <label className="mb-1.5 block font-mono text-[11px] uppercase tracking-wide text-neutral-500">
            join by code
          </label>
          <div className="flex gap-2">
            <input
              value={joinSlug}
              onChange={(e) => setJoinSlug(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && joinSlug.trim() && router.push(`/room/${joinSlug.trim()}`)
              }
              placeholder="room-code"
              className="flex-1 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 font-mono text-sm text-neutral-100 placeholder-neutral-600 outline-none transition-colors focus:border-neutral-600"
            />
            <button
              type="button"
              onClick={() => joinSlug.trim() && router.push(`/room/${joinSlug.trim()}`)}
              disabled={!joinSlug.trim()}
              className="rounded-md border border-neutral-800 px-4 text-sm text-neutral-300 transition-colors hover:border-neutral-600 disabled:opacity-30"
            >
              Join
            </button>
          </div>
        </div>

        {rooms.length > 0 && (
          <div className="mt-8 border-t border-neutral-800 pt-6">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-wide text-neutral-500">
              rooms
            </p>
            <div className="space-y-1">
              {rooms.map((room) => (
                <div
                  key={room.slug}
                  className="flex items-center justify-between gap-3 border-b border-neutral-900 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/room/${room.slug}`)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-sm text-neutral-200">{room.name}</div>
                    <div className="truncate font-mono text-[11px] text-neutral-600">
                      {room.slug} · v{room.versions} · {room.participants}p
                    </div>
                  </button>

                  {confirmSlug === room.slug ? (
                    <div className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
                      <span className="text-red-400">delete?</span>
                      <button
                        type="button"
                        onClick={() => void closeRoom(room.slug)}
                        disabled={closingSlug === room.slug}
                        className="text-red-400 hover:text-red-300"
                      >
                        yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmSlug(null)}
                        className="text-neutral-500 hover:text-neutral-300"
                      >
                        no
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmSlug(room.slug)}
                      className="shrink-0 font-mono text-[11px] text-neutral-600 hover:text-neutral-300"
                    >
                      close
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
