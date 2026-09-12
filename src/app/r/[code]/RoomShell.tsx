"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRoom } from "@/hooks/useRoom";
import { ModelStage } from "@/components/ModelStage";
import { MakingOverlay } from "@/components/MakingOverlay";
import { Filmstrip } from "@/components/Filmstrip";
import { PromptBar } from "@/components/PromptBar";
import { Presence } from "@/components/Presence";
import { HandoffQR } from "@/components/HandoffQR";
import type { Room, Version } from "@/lib/types";

export function RoomShell({ room, initialVersions }: { room: Room; initialVersions: Version[] }) {
  const { room: live, versions, peers, current, pending, submit, connected } = useRoom(
    room,
    initialVersions,
  );

  // Which version the viewer is showing. Null means "follow the room".
  //
  // A pin is stamped with the room pointer it was made against, so when the
  // room lands a new version the pin expires on its own and everyone snaps
  // back to looking at the same thing. Derived, so no effect is needed.
  const [pin, setPin] = useState<{ id: string; atVersion: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const pinnedId = pin && pin.atVersion === live.current_version_id ? pin.id : null;

  const shown = useMemo(
    () => versions.find((v) => v.id === pinnedId && v.glb_url) ?? current,
    [versions, pinnedId, current],
  );

  const lastFailed = versions[versions.length - 1]?.status === "failed"
    ? versions[versions.length - 1]
    : null;

  const roomUrl = typeof window !== "undefined" ? window.location.href : "";

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the code is on screen anyway */
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col">
      {/* ── Header ───────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-rule px-6 py-3.5">
        <div className="flex items-baseline gap-4">
          <Link href="/" className="text-[15px] text-bone-dim transition-colors hover:text-bone">
            Studio
          </Link>
          <button
            type="button"
            onClick={copyCode}
            title="Copy the link to this room"
            className="text-[15px] tracking-wide text-bone transition-colors hover:text-bone-dim"
            style={{ fontFamily: "var(--font-mono), monospace" }}
          >
            {copied ? "link copied" : live.code}
          </button>
        </div>

        <Presence peers={peers} connected={connected} />
      </header>

      {/* ── Stage ────────────────────────────────────────────── */}
      <main className="relative min-h-0 flex-1 bg-ground-deep">
        {shown?.glb_url ? (
          <ModelStage
            glbUrl={shown.glb_url}
            usdzUrl={shown.usdz_url}
            posterUrl={shown.thumb_url}
            alt={shown.brief ?? shown.instruction}
            busy={Boolean(pending)}
            className="h-full w-full"
          />
        ) : (
          !pending && (
            <div className="grid h-full place-items-center px-6">
              <div className="max-w-[34ch] text-center">
                <h1
                  className="text-[clamp(1.75rem,4vw,2.5rem)] leading-[1.1] text-bone"
                  style={{ fontStretch: "125%", fontWeight: 500 }}
                >
                  Nothing here yet.
                </h1>
                <p className="mt-3 text-[15px] leading-relaxed text-bone-dim">
                  Describe an object below. Everyone in the room watches it appear,
                  then you all shape it from there.
                </p>
              </div>
            </div>
          )
        )}

        {pending && <MakingOverlay version={pending} />}

        {/* Brief — what the machine currently believes it is making. */}
        {shown?.brief && !pending && (
          <aside className="pointer-events-none absolute left-6 top-6 max-w-[38ch]">
            <p className="text-[13px] leading-relaxed text-bone-dim">{shown.brief}</p>
            {pinnedId && (
              <p className="mt-2 text-[13px] text-bone-faint">
                Looking at an earlier version
              </p>
            )}
          </aside>
        )}

        {/* Desktop handoff: AR lives on a phone. */}
        {shown?.glb_url && !pending && roomUrl && (
          <div className="pointer-events-none absolute bottom-6 left-6 hidden lg:block">
            <HandoffQR url={roomUrl} />
          </div>
        )}
      </main>

      {/* ── Lineage + prompt ─────────────────────────────────── */}
      <div className="shrink-0 border-t border-rule">
        <Filmstrip versions={versions} selectedId={shown?.id ?? null} onSelect={(v) => setPin({ id: v.id, atVersion: live.current_version_id })} />

        <div className="border-t border-rule-soft px-6 py-4">
          <div className="mx-auto max-w-2xl">
            <PromptBar
              onSubmit={(text) => submit(text, shown?.id ?? null)}
              hasObject={Boolean(current)}
              disabled={Boolean(pending)}
              disabledReason={
                pending
                  ? "One at a time — this object is being shaped right now."
                  : lastFailed?.error
                    ? `That didn't work: ${lastFailed.error}`
                    : undefined
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
