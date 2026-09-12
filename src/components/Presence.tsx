"use client";

import { hueFor, initialsFor } from "@/lib/identity";
import type { Peer } from "@/hooks/useRoom";

/**
 * The one place chroma enters the interface: hue identifies a person. Colour
 * here is information, not decoration, which is why it is allowed.
 */
export function Presence({ peers, connected }: { peers: Peer[]; connected: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-1.5">
        {peers.slice(0, 6).map((p) => (
          <span
            key={p.userId}
            title={p.name}
            className="grid h-7 w-7 place-items-center rounded-full border text-[10px] font-medium"
            style={{
              borderColor: `hsl(${hueFor(p.userId)} 45% 62%)`,
              background: `hsl(${hueFor(p.userId)} 40% 20%)`,
              color: `hsl(${hueFor(p.userId)} 55% 82%)`,
            }}
          >
            {initialsFor(p.name)}
          </span>
        ))}
        {peers.length > 6 && (
          <span className="grid h-7 w-7 place-items-center rounded-full border border-rule bg-ground-up text-[10px] text-bone-dim">
            +{peers.length - 6}
          </span>
        )}
      </div>
      <span className="text-[13px] text-bone-faint">
        {connected
          ? `${peers.length} ${peers.length === 1 ? "person" : "people"} here`
          : "Reconnecting"}
      </span>
    </div>
  );
}
