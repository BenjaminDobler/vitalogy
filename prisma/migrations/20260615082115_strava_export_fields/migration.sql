-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "stravaActivityId" TEXT,
ADD COLUMN     "stravaExportId" TEXT,
ADD COLUMN     "stravaExportedAt" TIMESTAMP(3);
