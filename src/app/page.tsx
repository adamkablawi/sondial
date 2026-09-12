"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [constraints, setConstraints] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinSlug, setJoinSlug] = useState("");

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
    <main className="flex min-h-screen items-center justify-center p-6">
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
      </div>
    </main>
  );
}
