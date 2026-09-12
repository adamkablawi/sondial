/** Job lifecycle. The middle states drive distinct UI copy while people wait. */
export type VersionStatus =
  | "queued"
  | "briefing"
  | "generating"
  | "texturing"
  | "uploading"
  | "ready"
  | "failed";

export type Version = {
  id: string;
  room_id: string;
  parent_id: string | null;
  author_id: string | null;
  author_name: string;
  instruction: string;
  brief: string | null;
  status: VersionStatus;
  progress: number;
  meshy_task_id: string | null;
  glb_url: string | null;
  usdz_url: string | null;
  thumb_url: string | null;
  error: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Room = {
  id: string;
  code: string;
  name: string;
  current_version_id: string | null;
  created_at: string;
}

/** Terminal states — nothing further will happen to these rows. */
export const isSettled = (s: VersionStatus) => s === "ready" || s === "failed";

/** Human-facing copy for each stage. Shown to everyone in the room. */
export const STATUS_COPY: Record<VersionStatus, string> = {
  queued: "Waiting in line",
  briefing: "Writing the brief",
  generating: "Sculpting geometry",
  texturing: "Painting textures",
  uploading: "Finishing up",
  ready: "Ready",
  failed: "Failed",
};

/**
 * Rough share of total time each stage occupies, used to turn per-stage
 * progress into one honest end-to-end bar. Meshy's preview pass dominates.
 */
export const STAGE_WEIGHTS: Record<VersionStatus, [start: number, end: number]> = {
  queued: [0, 2],
  briefing: [2, 10],
  generating: [10, 62],
  texturing: [62, 92],
  uploading: [92, 99],
  ready: [100, 100],
  failed: [0, 0],
};

/** Blend stage + in-stage progress into a single 0-100 number. */
export function overallProgress(status: VersionStatus, progress: number): number {
  const [start, end] = STAGE_WEIGHTS[status];
  return Math.round(start + ((end - start) * Math.min(100, Math.max(0, progress))) / 100);
}
