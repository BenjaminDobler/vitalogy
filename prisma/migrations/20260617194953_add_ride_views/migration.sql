-- CreateEnum
CREATE TYPE "RideViewKind" AS ENUM ('DEFAULT_COMBINED', 'DEFAULT_WORKOUT', 'DEFAULT_SENSORS', 'CUSTOM');

-- CreateTable
CREATE TABLE "RideView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "RideViewKind" NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rows" INTEGER NOT NULL DEFAULT 4,
    "cols" INTEGER NOT NULL DEFAULT 4,
    "gridConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RideView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RideView_userId_sortOrder_idx" ON "RideView"("userId", "sortOrder");

-- AddForeignKey
ALTER TABLE "RideView" ADD CONSTRAINT "RideView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
