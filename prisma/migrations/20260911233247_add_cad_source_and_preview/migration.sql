-- AlterTable
ALTER TABLE "ObjectVersion" ADD COLUMN     "cadSource" TEXT,
ADD COLUMN     "cadSourcePath" TEXT,
ADD COLUMN     "previewImage" BYTEA,
ADD COLUMN     "previewMimetype" TEXT;

