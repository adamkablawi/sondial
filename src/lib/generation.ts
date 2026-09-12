import { db } from "./db";
import { generationQueue } from "./queue";
import { publishRoomEvent, toJobDTO } from "./serialize";
import type { GenerationJob, Participant } from "@prisma/client";

/**
 * Creates and enqueues the GenerationJob for an instruction whose text is
 * already settled. Shared by direct instruction submission and by answering
 * an AGENT clarifying question — both end here once there is exactly one
 * unambiguous instruction to act on.
 */
export async function createInstructionJob(args: {
  roomId: string;
  roomSlug: string;
  projectId: string;
  headVersionId: string | null;
  participantId: string;
  messageId: string;
  instruction: string;
}): Promise<GenerationJob & { author: Participant | null }> {
  if (!args.headVersionId) {
    throw new Error("Project has no base version to iterate from");
  }

  const job = await db.generationJob.create({
    data: {
      roomId: args.roomId,
      projectId: args.projectId,
      baseVersionId: args.headVersionId,
      messageId: args.messageId,
      authorId: args.participantId,
      instruction: args.instruction,
    },
    include: { author: true },
  });

  await generationQueue.add("generate", { jobId: job.id, roomSlug: args.roomSlug });
  await publishRoomEvent(args.roomSlug, { type: "job", job: toJobDTO(job) });

  return job;
}
