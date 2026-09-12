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
  const headVersionId = useRoomStore((s) => s.headVersionId);
  const selectedVersionId = useRoomStore((s) => s.selectedVersionId);
  const selectVersion = useRoomStore((s) => s.selectVersion);

  const activeId = selectedVersionId ?? headVersionId;

  return (
    <div className="border-t border-neutral-800 bg-neutral-950">
      <div className="flex items-center justify-between px-4 py-2">
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

      <div className="flex gap-2 overflow-x-auto px-4 pb-3">
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
              className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-all ${
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

        {versions.length === 0 && (
          <p className="py-2 text-xs text-neutral-600">No versions yet.</p>
        )}
      </div>
    </div>
  );
}
