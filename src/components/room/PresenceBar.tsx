"use client";

import { useRoomStore } from "@/stores/room-store";

export function PresenceBar() {
  const participants = useRoomStore((s) => s.participants);
  const connected = useRoomStore((s) => s.connected);

  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {participants.map((p) => (
          <div
            key={p.id}
            title={`${p.displayName}${p.connected ? "" : " (offline)"}`}
            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-neutral-950 text-[11px] font-semibold text-neutral-950 transition-opacity ${
              p.connected ? "opacity-100" : "opacity-35"
            }`}
            style={{ backgroundColor: p.color }}
          >
            {p.displayName.slice(0, 2).toUpperCase()}
          </div>
        ))}
        {participants.length === 0 && (
          <span className="text-xs text-neutral-600">No one here yet</span>
        )}
      </div>

      <span
        className={`flex items-center gap-1.5 text-xs ${
          connected ? "text-green-400" : "text-amber-400"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            connected ? "bg-green-400" : "bg-amber-400 animate-pulse"
          }`}
        />
        {connected ? "Live" : "Reconnecting"}
      </span>
    </div>
  );
}
