"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  DesignStateDTO,
  JobDTO,
  MessageDTO,
  ParticipantDTO,
  RoomEvent,
  VersionDTO,
} from "@/lib/events";

export interface RoomSnapshot {
  room: { slug: string; name: string };
  project: {
    id: string;
    name: string;
    constraints: string | null;
    headVersionId: string | null;
  };
  participants: ParticipantDTO[];
  messages: MessageDTO[];
  versions: VersionDTO[];
  jobs: JobDTO[];
  designState: DesignStateDTO | null;
}

interface RoomState {
  // Identity — the only slice that persists, so attribution survives a reload.
  sessionId: string | null;
  displayName: string | null;
  setIdentity: (sessionId: string, displayName: string) => void;

  // Server state.
  slug: string | null;
  roomName: string | null;
  constraints: string | null;
  participants: ParticipantDTO[];
  messages: MessageDTO[];
  versions: VersionDTO[];
  jobs: JobDTO[];
  headVersionId: string | null;
  designState: DesignStateDTO | null;

  /// Null means "follow the head"; set means the user is browsing history.
  selectedVersionId: string | null;
  selectVersion: (id: string | null) => void;

  connected: boolean;
  setConnected: (v: boolean) => void;

  hydrate: (snapshot: RoomSnapshot) => void;
  applyEvent: (event: RoomEvent) => void;
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) return [...list, item];
  const next = [...list];
  next[index] = item;
  return next;
}

export const useRoomStore = create<RoomState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      displayName: null,
      setIdentity: (sessionId, displayName) => set({ sessionId, displayName }),

      slug: null,
      roomName: null,
      constraints: null,
      participants: [],
      messages: [],
      versions: [],
      jobs: [],
      headVersionId: null,
      designState: null,

      selectedVersionId: null,
      selectVersion: (id) => set({ selectedVersionId: id }),

      connected: false,
      setConnected: (v) => set({ connected: v }),

      hydrate: (snapshot) =>
        set({
          slug: snapshot.room.slug,
          roomName: snapshot.room.name,
          constraints: snapshot.project.constraints,
          participants: snapshot.participants,
          messages: snapshot.messages,
          versions: snapshot.versions,
          jobs: snapshot.jobs,
          headVersionId: snapshot.project.headVersionId,
          designState: snapshot.designState,
        }),

      applyEvent: (event) => {
        switch (event.type) {
          case "presence":
            set({ participants: event.participants });
            break;

          case "message":
            set((s) => ({ messages: upsertById(s.messages, event.message) }));
            break;

          case "job":
            set((s) => ({ jobs: upsertById(s.jobs, event.job) }));
            break;

          case "version": {
            const state = get();
            const versions = upsertById(state.versions, event.version).sort(
              (a, b) => a.versionNumber - b.versionNumber,
            );
            set({
              versions,
              headVersionId: event.headVersionId ?? state.headVersionId,
              // Only adopt the incoming design state when it belongs to the head.
              designState:
                event.designState && event.headVersionId === event.version.id
                  ? event.designState
                  : state.designState,
            });
            break;
          }

          case "head":
            set({ headVersionId: event.headVersionId });
            break;
        }
      },
    }),
    {
      name: "sondial-identity",
      partialize: (state) => ({
        sessionId: state.sessionId,
        displayName: state.displayName,
      }),
    },
  ),
);

/** The version actually shown in the viewer: an explicit pick, else the head. */
export function useActiveVersion(): VersionDTO | null {
  const versions = useRoomStore((s) => s.versions);
  const selectedId = useRoomStore((s) => s.selectedVersionId);
  const headId = useRoomStore((s) => s.headVersionId);
  const targetId = selectedId ?? headId;
  return versions.find((v) => v.id === targetId) ?? null;
}
