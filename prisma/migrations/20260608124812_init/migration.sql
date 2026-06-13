-- CreateEnum
CREATE TYPE "AIProvider" AS ENUM ('ANTHROPIC', 'GEMINI');

-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('STRAVA', 'MANUAL', 'FIT_FILE', 'TCX_FILE', 'GPX_FILE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StravaAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "athleteId" BIGINT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StravaAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AIProvider" NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "ActivitySource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sportType" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "durationSec" INTEGER NOT NULL,
    "elapsedSec" INTEGER NOT NULL,
    "distanceM" DOUBLE PRECISION NOT NULL,
    "elevationGainM" DOUBLE PRECISION,
    "avgSpeedMps" DOUBLE PRECISION,
    "maxSpeedMps" DOUBLE PRECISION,
    "avgWatts" DOUBLE PRECISION,
    "weightedAvgWatts" DOUBLE PRECISION,
    "maxWatts" INTEGER,
    "kilojoules" DOUBLE PRECISION,
    "avgHeartrate" DOUBLE PRECISION,
    "maxHeartrate" INTEGER,
    "avgCadence" DOUBLE PRECISION,
    "trainerActivity" BOOLEAN NOT NULL DEFAULT false,
    "commute" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stream" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "resolution" TEXT NOT NULL DEFAULT 'high',
    "data" JSONB NOT NULL,

    CONSTRAINT "Stream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lap" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "lapIndex" INTEGER NOT NULL,
    "name" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "distanceM" DOUBLE PRECISION NOT NULL,
    "avgWatts" DOUBLE PRECISION,
    "avgHeartrate" DOUBLE PRECISION,
    "avgSpeedMps" DOUBLE PRECISION,
    "elevationGainM" DOUBLE PRECISION,

    CONSTRAINT "Lap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityId" TEXT,
    "provider" "AIProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(10,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "StravaAccount_userId_key" ON "StravaAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StravaAccount_athleteId_key" ON "StravaAccount"("athleteId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_userId_provider_key" ON "ApiKey"("userId", "provider");

-- CreateIndex
CREATE INDEX "Activity_userId_startTime_idx" ON "Activity"("userId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_source_sourceId_key" ON "Activity"("source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Stream_activityId_type_resolution_key" ON "Stream"("activityId", "type", "resolution");

-- CreateIndex
CREATE UNIQUE INDEX "Lap_activityId_lapIndex_key" ON "Lap"("activityId", "lapIndex");

-- CreateIndex
CREATE INDEX "Analysis_userId_createdAt_idx" ON "Analysis"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "StravaAccount" ADD CONSTRAINT "StravaAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stream" ADD CONSTRAINT "Stream_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lap" ADD CONSTRAINT "Lap_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
