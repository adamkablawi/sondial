"use client";

import { STATUS_COPY, type Version } from "@/lib/types";
import { hueFor } from "@/lib/identity";

interface FilmstripProps {
  versions: Version[];
  selectedId: string | null;
  onSelect: (v: Version) => void;
}

/**
 * The room's lineage. Each version descends from the one before, so the strip
 * is drawn as a connected chain — the connectors encode that this really is a
 * sequence, rather than decorating a list of cards.
 */
export function Filmstrip({ versions, selectedId, onSelect }: FilmstripProps) {
  if (versions.length === 0) return null;

  return (
    <div className="flex items-stretch gap-0 overflow-x-auto px-6 py-4">
      {versions.map((v, i) => {
        const selected = v.id === selectedId;
        const failed = v.status === "failed";
        const working = !failed && v.status !== "ready";

        return (
          <div key={v.id} className="flex shrink-0 items-center">
            {i > 0 && <span aria-hidden className="h-px w-5 bg-rule" />}

            <button
              type="button"
              onClick={() => onSelect(v)}
              aria-current={selected}
              className={`group relative w-[124px] border px-2.5 pb-2.5 pt-2 text-left transition-colors ${
                selected
                  ? "border-bone bg-ground-up"
                  : "border-rule bg-ground-deep hover:border-bone-faint"
              }`}
            >
              <div className="relative mb-2 aspect-square w-full overflow-hidden bg-ground">
                {v.thumb_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumb_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center">
                    <span
                      className={`text-[11px] ${failed ? "text-rust" : "text-bone-faint"} ${
                        working ? "breathe" : ""
                      }`}
                    >
                      {failed ? "failed" : working ? `${v.progress}%` : "no preview"}
                    </span>
                  </div>
                )}
              </div>

              <p className="line-clamp-2 text-[12px] leading-tight text-bone-dim group-hover:text-bone">
                {v.instruction}
              </p>

              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-bone-faint">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: `hsl(${hueFor(v.author_id ?? v.id)} 50% 60%)` }}
                />
                {working ? STATUS_COPY[v.status] : v.author_name}
              </p>
            </button>
          </div>
        );
      })}
    </div>
  );
}
