"use client";

import { useState } from "react";
import { useRoomStore } from "@/stores/room-store";
import type { DesignStateDTO } from "@/lib/events";

const SECTIONS: Array<{ key: keyof DesignStateDTO; label: string }> = [
  { key: "summary", label: "Summary" },
  { key: "geometry", label: "Geometry" },
  { key: "materials", label: "Materials & finish" },
  { key: "dimensions", label: "Dimensions" },
  { key: "constraints", label: "Manufacturing constraints" },
  { key: "function", label: "Function" },
  { key: "rationale", label: "Design rationale" },
];

/**
 * The durable design state. This is the context every edit is grounded in —
 * not the chat message alone — so it is surfaced as a first-class panel.
 */
export function DesignStatePanel() {
  const designState = useRoomStore((s) => s.designState);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!designState) {
    return (
      <div className="p-4 text-xs text-neutral-600 italic">
        No design state yet.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-800 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Design state
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-neutral-600">
          Carried into every generation so edits stay consistent with earlier decisions.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {SECTIONS.map(({ key, label }) => {
          const isCollapsed = collapsed[key];
          const value = designState[key];

          return (
            <div key={key} className="border-b border-neutral-900">
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors hover:bg-neutral-900/50"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  {label}
                </span>
                <span className="text-neutral-600">{isCollapsed ? "+" : "−"}</span>
              </button>
              {!isCollapsed && (
                <p className="whitespace-pre-wrap px-4 pb-3 text-xs leading-relaxed text-neutral-300">
                  {value}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
