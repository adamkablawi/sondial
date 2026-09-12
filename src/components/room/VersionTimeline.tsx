"use client";

import { useRoomStore } from "@/stores/room-store";
import type { VersionDTO } from "@/lib/events";

const STATUS_STYLES: Record<VersionDTO["status"], string> = {
  GENERATING: "border-blue-500 bg-blue-500/10 text-blue-300",
  COMPLETE: "border-neutral-600 bg-neutral-800 text-neutral-200",
  APPROVED: "border-green-500 bg-green-500/10 text-green-300",
  REJECTED: "border-red-500/60 bg-red-500/10 text-red-300",
  FAILED: "border-red-500/60 bg-red-500/10 text-red-300",
  SUPERSEDED: "border-neutral-700 bg-neutral-900 text-neutral-500",
};

export function VersionTimeline() {
  const versions = useRoomStore((s) => s.versions);
  const jobs = useRoomStore((s) => s.jobs);
  const headVersionId = useRoomStore((s) => s.headVersionId);
  const selectedVersionId = useRoomStore((s) => s.selectedVersionId);
  const selectVersion = useRoomStore((s) => s.selectVersion);

  const activeId = selectedVersionId ?? headVersionId;
  // A version row only exists once generation succeeds, so in-flight work is
  // shown from the job itself.
  const pending = jobs.filter((j) => j.status === "QUEUED" || j.status === "RUNNING");

  return (
    // shrink-0: as a flex child it would otherwise compress and clip its cards
    // when the viewer above claims the space. min-h matches the composer's
    // footer band in ChatPanel.tsx (search "min-h-[104px]" there) so the two
    // border-t lines land at the same height across the columns — keep both
    // values equal if either changes. This is a floor, not a fixed height: if
    // the cards' real content is taller than this number, the box grows past
    // it and the composer (which stays pinned to the min-h) falls out of
    // alignment again — that is exactly what 88px did.
    <div className="flex min-h-[104px] shrink-0 flex-col justify-center border-t border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between px-4 py-1.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          Versions
        </h2>
        {selectedVersionId && selectedVersionId !== headVersionId && (
          <button
            type="button"
            onClick={() => selectVersion(null)}
            className="rounded bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-700"
          >
            Follow latest
          </button>
        )}
      </div>

      {/* pt-1: overflow-x-auto also clips vertically, which would cut the
          selected card's ring. */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-1">
        {versions.map((v, i) => {
          const isActive = v.id === activeId;
          const isHead = v.id === headVersionId;
          // A parent other than the previous entry means this version branched.
          const branched = v.parentId !== null && versions[i - 1]?.id !== v.parentId;

          return (
            <button
              key={v.id}
              type="button"
              onClick={() => selectVersion(v.id)}
              title={v.label ?? undefined}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-left transition-all ${
                STATUS_STYLES[v.status]
              } ${isActive ? "ring-2 ring-white/40" : "hover:brightness-125"}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold">v{v.versionNumber}</span>
                {isHead && (
                  <span className="rounded bg-white/10 px-1 text-[9px] font-semibold uppercase">
                    head
                  </span>
                )}
                {branched && (
                  <span
                    title={`Branched from an earlier version`}
                    className="text-[9px] text-amber-400"
                  >
                    ⑂
                  </span>
                )}
              </div>

              <div className="mt-0.5 max-w-[140px] truncate text-[10px] opacity-70">
                {v.label ?? "—"}
              </div>

              {v.createdBy && (
                <div className="mt-1 flex items-center gap-1">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: v.createdBy.color }}
                  />
                  <span className="text-[10px] opacity-60">
                    {v.createdBy.displayName}
                  </span>
                </div>
              )}
            </button>
          );
        })}

        {pending.map((job) => (
          <div
            key={job.id}
            title={job.instruction}
            className="shrink-0 rounded-lg border border-dashed border-blue-500/50 bg-blue-500/5 px-3 py-1.5"
          >
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
              <span className="text-xs font-semibold text-blue-300">
                {job.status === "QUEUED" ? "queued" : `${job.progress}%`}
              </span>
            </div>
            <div className="mt-0.5 max-w-[140px] truncate text-[10px] text-blue-300/60">
              {job.instruction}
            </div>
            {job.author && (
              <div className="mt-1 flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: job.author.color }}
                />
                <span className="text-[10px] text-blue-300/50">
                  {job.author.displayName}
                </span>
              </div>
            )}
          </div>
        ))}

        {versions.length === 0 && pending.length === 0 && (
          <p className="py-2 text-xs text-neutral-600">No versions yet.</p>
        )}
      </div>
    </div>
  );
}
