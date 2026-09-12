-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('CHAT', 'INSTRUCTION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('GENERATING', 'COMPLETE', 'FAILED', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETE', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "JobStrategy" AS ENUM ('REGENERATE', 'RETEXTURE');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "constraints" TEXT,
    "headVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "participantId" TEXT,
    "kind" "MessageKind" NOT NULL DEFAULT 'CHAT',
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObjectVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "parentId" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "label" TEXT,
    "status" "VersionStatus" NOT NULL DEFAULT 'GENERATING',
    "meshUrl" TEXT,
    "meshFormat" TEXT,
    "meshyTaskId" TEXT,
    "thumbnailUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObjectVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersionDescription" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "geometry" TEXT NOT NULL,
    "materials" TEXT NOT NULL,
    "dimensions" TEXT NOT NULL,
    "constraints" TEXT NOT NULL,
    "function" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersionDescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "baseVersionId" TEXT NOT NULL,
    "resultVersionId" TEXT,
    "messageId" TEXT,
    "authorId" TEXT,
    "rebasedFromVersionId" TEXT,
    "instruction" TEXT NOT NULL,
    "compiledPrompt" TEXT,
    "strategy" "JobStrategy" NOT NULL DEFAULT 'REGENERATE',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Room_slug_key" ON "Room"("slug");

-- CreateIndex
CREATE INDEX "Room_projectId_idx" ON "Room"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_sessionId_key" ON "Participant"("sessionId");

-- CreateIndex
CREATE INDEX "Participant_roomId_idx" ON "Participant"("roomId");

-- CreateIndex
CREATE INDEX "ChatMessage_roomId_createdAt_idx" ON "ChatMessage"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "ObjectVersion_projectId_idx" ON "ObjectVersion"("projectId");

-- CreateIndex
CREATE INDEX "ObjectVersion_parentId_idx" ON "ObjectVersion"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ObjectVersion_projectId_versionNumber_key" ON "ObjectVersion"("projectId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "VersionDescription_versionId_key" ON "VersionDescription"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_resultVersionId_key" ON "GenerationJob"("resultVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_messageId_key" ON "GenerationJob"("messageId");

-- CreateIndex
CREATE INDEX "GenerationJob_roomId_createdAt_idx" ON "GenerationJob"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_status_idx" ON "GenerationJob"("status");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectVersion" ADD CONSTRAINT "ObjectVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectVersion" ADD CONSTRAINT "ObjectVersion_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ObjectVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObjectVersion" ADD CONSTRAINT "ObjectVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VersionDescription" ADD CONSTRAINT "VersionDescription_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ObjectVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_baseVersionId_fkey" FOREIGN KEY ("baseVersionId") REFERENCES "ObjectVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_resultVersionId_fkey" FOREIGN KEY ("resultVersionId") REFERENCES "ObjectVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
