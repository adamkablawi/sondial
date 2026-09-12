"use client";

import { STATUS_COPY, overallProgress, type Version } from "@/lib/types";

/**
 * Generation takes a minute or two, and in a room full of people that wait is
 * most of what anyone actually watches. So it gets the centre of the stage:
 * who asked, what they asked for, which stage it is in, and one honest bar.
 */
export function MakingOverlay({ version }: { version: Version }) {
  const pct = overallProgress(version.status, version.progress);

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {/* The survey line — the single piece of ambient motion in the product. */}
      <div className="survey-line absolute inset-x-0 top-0 h-px bg-bone/45" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 p-10">
        <p className="max-w-[46ch] text-center text-[15px] leading-snug text-bone">
          {version.instruction}
        </p>

        <div className="flex w-full max-w-sm flex-col gap-2">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-bone-dim">{STATUS_COPY[version.status]}</span>
            <span className="text-bone-faint tabular-nums">{pct}%</span>
          </div>

          <div className="h-px w-full bg-rule">
            <div
              className="h-px bg-bone transition-[width] duration-700 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>

          <p className="text-[13px] text-bone-faint">{version.author_name} asked for this</p>
        </div>
      </div>
    </div>
  );
}
