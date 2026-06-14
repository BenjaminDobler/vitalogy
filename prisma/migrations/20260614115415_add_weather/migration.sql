-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "apparentTempC" DOUBLE PRECISION,
ADD COLUMN     "humidityPct" DOUBLE PRECISION,
ADD COLUMN     "precipMm" DOUBLE PRECISION,
ADD COLUMN     "tempC" DOUBLE PRECISION,
ADD COLUMN     "weatherCode" INTEGER,
ADD COLUMN     "weatherObservedAt" TIMESTAMP(3),
ADD COLUMN     "weatherSource" TEXT,
ADD COLUMN     "windDirectionDeg" DOUBLE PRECISION,
ADD COLUMN     "windGustKmh" DOUBLE PRECISION,
ADD COLUMN     "windSpeedKmh" DOUBLE PRECISION;
