-- AlterEnum
ALTER TYPE "MessageKind" ADD VALUE 'AGENT';

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "agentOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "answeredByName" TEXT,
ADD COLUMN     "answeredOptionIndex" INTEGER;

