import type {
  ChatMessage,
  GenerationJob,
  ObjectVersion,
  Participant,
  VersionDescription,
} from "@prisma/client";
import { publisher } from "./redis";
import { roomChannel } from "./events";
import type {
  DesignStateDTO,
  JobDTO,
  MessageDTO,
  RoomEvent,
  VersionDTO,
} from "./events";

/** Author chip shared by messages, versions, and jobs. */
function toAuthor(p: Participant | null | undefined) {
  return p ? { id: p.id, displayName: p.displayName, color: p.color } : null;
}

export function toMessageDTO(
  message: ChatMessage & { participant?: Participant | null },
): MessageDTO {
  return {
    id: message.id,
    kind: message.kind,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    author: toAuthor(message.participant),
  };
}

export function toVersionDTO(
  version: ObjectVersion & { createdBy?: Participant | null },
): VersionDTO {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    parentId: version.parentId,
    label: version.label,
    status: version.status,
    meshUrl: version.meshUrl,
    meshFormat: version.meshFormat,
    // The bytes stay in the database; the client gets a URL to fetch them from.
    previewUrl: version.previewMimetype ? `/api/versions/${version.id}/preview` : null,
    cadSource: version.cadSource,
    cadSourcePath: version.cadSourcePath,
    createdAt: version.createdAt.toISOString(),
    createdBy: toAuthor(version.createdBy),
  };
}

export function toDesignStateDTO(d: VersionDescription): DesignStateDTO {
  return {
    summary: d.summary,
    geometry: d.geometry,
    materials: d.materials,
    dimensions: d.dimensions,
    constraints: d.constraints,
    function: d.function,
    rationale: d.rationale,
    raw: d.raw,
  };
}

export function toJobDTO(
  job: GenerationJob & { author?: Participant | null },
): JobDTO {
  return {
    id: job.id,
    status: job.status,
    strategy: job.strategy,
    progress: job.progress,
    instruction: job.instruction,
    compiledPrompt: job.compiledPrompt,
    baseVersionId: job.baseVersionId,
    resultVersionId: job.resultVersionId,
    error: job.error,
    author: toAuthor(job.author),
    createdAt: job.createdAt.toISOString(),
  };
}

/** Single fan-out path: Postgres is written first, then this publishes. */
export async function publishRoomEvent(
  roomSlug: string,
  event: RoomEvent,
): Promise<void> {
  await publisher.publish(roomChannel(roomSlug), JSON.stringify(event));
}
