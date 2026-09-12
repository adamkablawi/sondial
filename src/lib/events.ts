/**
 * The realtime contract shared by every process.
 *
 * Flow: API route or worker writes to Postgres (authoritative), then publishes a
 * RoomEvent to Redis. The realtime server subscribes and fans out to Socket.IO
 * room members. Clients never write through the socket — they POST, so that
 * persistence always happens before broadcast and nothing can be lost.
 */

export const ROOM_CHANNEL_PREFIX = "sondial:room:";

export function roomChannel(roomSlug: string): string {
  return `${ROOM_CHANNEL_PREFIX}${roomSlug}`;
}

// ── DTOs (serialised shapes sent over the wire) ──

export interface ParticipantDTO {
  id: string;
  displayName: string;
  color: string;
  connected: boolean;
}

export interface MessageDTO {
  id: string;
  kind: "CHAT" | "INSTRUCTION" | "SYSTEM";
  body: string;
  createdAt: string;
  author: { id: string; displayName: string; color: string } | null;
}

export interface VersionDTO {
  id: string;
  versionNumber: number;
  parentId: string | null;
  label: string | null;
  status: "GENERATING" | "COMPLETE" | "FAILED" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  meshUrl: string | null;
  meshFormat: string | null;
  createdAt: string;
  createdBy: { id: string; displayName: string; color: string } | null;
}

export interface DesignStateDTO {
  summary: string;
  geometry: string;
  materials: string;
  dimensions: string;
  constraints: string;
  function: string;
  rationale: string;
  raw: string;
}

export interface JobDTO {
  id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETE" | "FAILED" | "SUPERSEDED";
  strategy: "REGENERATE" | "RETEXTURE";
  progress: number;
  instruction: string;
  compiledPrompt: string | null;
  baseVersionId: string;
  resultVersionId: string | null;
  error: string | null;
  author: { id: string; displayName: string; color: string } | null;
  createdAt: string;
}

// ── Events ──

export type RoomEvent =
  | { type: "presence"; participants: ParticipantDTO[] }
  | { type: "message"; message: MessageDTO }
  | { type: "job"; job: JobDTO }
  | {
      type: "version";
      version: VersionDTO;
      designState: DesignStateDTO | null;
      headVersionId: string | null;
    }
  | { type: "head"; headVersionId: string };

// ── Socket.IO client → server ──

export interface JoinPayload {
  roomSlug: string;
  sessionId: string;
}

export const SOCKET_EVENTS = {
  join: "room:join",
  leave: "room:leave",
  event: "room:event",
} as const;
