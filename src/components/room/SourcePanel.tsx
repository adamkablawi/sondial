"use client";

import { useState } from "react";
import { useActiveVersion } from "@/stores/room-store";

/**
 * The parametric CAD source for the active version.
 *
 * For source-based providers this is the real artifact — the next edit is
 * applied to this text — so it is worth showing reviewers directly rather than
 * hiding behind the render.
 */
export function SourcePanel() {
  const version = useActiveVersion();
  const [open, setOpen] = useState(false);

  if (!version?.cadSource) return null;

  const lines = version.cadSource.split("\n").length;

  return (
    <div className="border-t border-neutral-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-neutral-900/50"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
          CAD source
          <span className="ml-1.5 font-normal normal-case text-neutral-600">
            {version.cadSourcePath ?? "source"} · {lines} lines
          </span>
        </span>
        <span className="text-neutral-600">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <pre className="max-h-80 overflow-auto border-t border-neutral-900 bg-neutral-950 px-4 py-3 font-mono text-[11px] leading-relaxed text-neutral-300">
          {version.cadSource}
        </pre>
      )}
    </div>
  );
}
