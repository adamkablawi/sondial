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
      // Leave the list as-is; creating or joining still works without it.
    }
  }, []);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  const closeRoom = useCallback(
    async (slug: string) => {
      setClosingSlug(slug);
      setError(null);
      try {
        const res = await fetch(`/api/rooms/${slug}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Could not close the room");
        }
        setRooms((list) => list.filter((r) => r.slug !== slug));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not close the room");
      } finally {
        setClosingSlug(null);
        setConfirmSlug(null);
      }
    },
    [],
  );

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
    // Top-aligned rather than centred: with the room list the page can exceed
    // the viewport, and centred overflow pushes the heading past the top edge
    // where it cannot be scrolled back into view.
    <main className="flex min-h-screen justify-center px-6 pb-16 pt-20">
      <div className="w-full max-w-xl space-y-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight text-white">Sondial</h1>
          <p className="mt-3 text-neutral-400">
            Review and iterate on a product in 3D, together, in plain language.
          </p>
        </div>

        <div className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">
              Product name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Insulated travel mug"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950/60 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">
              Design brief
            </label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              placeholder="A 400ml double-walled stainless steel travel mug with a tapered body, silicone grip band, and a screw-on lid with a sliding drink opening."
              className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950/60 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500"
            />
            <p className="mt-1 text-[11px] text-neutral-600">
              Seeds the design state every future change is grounded in. Be specific.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-400">
              Manufacturing constraints{" "}
              <span className="text-neutral-600">(optional)</span>
            </label>
            <textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              rows={2}
              placeholder="Injection-moulded, 2mm minimum wall thickness, no undercuts."
              className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-950/60 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="button"
            onClick={() => void create()}
            disabled={!name.trim() || !brief.trim() || creating}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
          >
            {creating ? "Creating room..." : "Create review room"}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-neutral-800" />
          <span className="text-xs text-neutral-600">or join one</span>
          <div className="h-px flex-1 bg-neutral-800" />
        </div>

        <div className="flex gap-2">
          <input
            value={joinSlug}
            onChange={(e) => setJoinSlug(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && joinSlug.trim() && router.push(`/room/${joinSlug.trim()}`)
            }
            placeholder="room-code"
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950/60 px-3 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-neutral-500"
          />
          <button
            type="button"
            onClick={() => joinSlug.trim() && router.push(`/room/${joinSlug.trim()}`)}
            disabled={!joinSlug.trim()}
            className="rounded-lg bg-neutral-800 px-5 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-700 disabled:opacity-40"
          >
            Join
          </button>
        </div>

        {rooms.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              Rooms
            </h2>

            {rooms.map((room) => (
              <div
                key={room.slug}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => router.push(`/room/${room.slug}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm text-neutral-200">{room.name}</div>
                  <div className="truncate text-[11px] text-neutral-500">
                    {room.slug} · {room.versions} version
                    {room.versions === 1 ? "" : "s"} · {room.participants} participant
                    {room.participants === 1 ? "" : "s"}
                  </div>
                </button>

                {confirmSlug === room.slug ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[11px] text-red-300">Delete all history?</span>
                    <button
                      type="button"
                      onClick={() => void closeRoom(room.slug)}
                      disabled={closingSlug === room.slug}
                      className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      {closingSlug === room.slug ? "..." : "Delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmSlug(null)}
                      className="rounded-md bg-neutral-800 px-2 py-1 text-[11px] text-neutral-300 hover:bg-neutral-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmSlug(room.slug)}
                    className="shrink-0 rounded-md border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 transition-colors hover:border-red-500/50 hover:text-red-300"
                  >
                    Close
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
