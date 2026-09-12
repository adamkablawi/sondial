-- DropIndex
DROP INDEX "Participant_sessionId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Participant_roomId_sessionId_key" ON "Participant"("roomId", "sessionId");

