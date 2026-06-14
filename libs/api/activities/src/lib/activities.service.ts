import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'db';
import type {
  Activity,
  ActivityDetail,
  ActivityStream,
  UploadActivityRequest,
  UploadActivityResponse,
  UploadSample,
} from 'data-models';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, opts: { limit?: number; cursor?: string } = {}): Promise<Activity[]> {
    const rows = await this.prisma.activity.findMany({
      where: { userId },
      orderBy: { startTime: 'desc' },
      take: opts.limit ?? 50,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    });
    return rows.map(toDto);
  }

  /**
   * Persist a session recorded on the mobile app as an Activity (source: MANUAL)
   * with derived stats and one Stream per non-empty metric. Idempotent on
   * (userId, sessionId) — re-uploads return the existing row.
   */
  async uploadRecording(
    userId: string,
    req: UploadActivityRequest,
  ): Promise<UploadActivityResponse> {
    // Make sure the user exists — middleware does this for non-default
    // userIds, but a fresh first upload still needs the row in place
    // because the foreign key from Activity requires it.
    await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email: `${userId}@local.vitalogy` },
      update: {},
    });

    const existing = await this.prisma.activity.findUnique({
      where: { source_sourceId: { source: 'MANUAL', sourceId: req.sessionId } },
    });
    if (existing) {
      return { activityId: existing.id, alreadyExisted: true };
    }

    const stats = summarize(req.samples, req.startedAt, req.endedAt);

    const created = await this.prisma.activity.create({
      data: {
        userId,
        source: 'MANUAL',
        sourceId: req.sessionId,
        name: req.name ?? defaultName(req.startedAt),
        sportType: req.sportType ?? 'Ride',
        startTime: new Date(req.startedAt),
        timezone: null,
        durationSec: stats.durationSec,
        elapsedSec: stats.durationSec,
        distanceM: stats.distanceM,
        elevationGainM: stats.elevationGainM,
        avgSpeedMps: stats.avgSpeedMps,
        maxSpeedMps: stats.maxSpeedMps,
        avgWatts: null,
        weightedAvgWatts: null,
        maxWatts: null,
        kilojoules: null,
        avgHeartrate: stats.avgHr,
        maxHeartrate: stats.maxHr,
        avgCadence: stats.avgCadence,
        trainerActivity: false,
        commute: false,
        tempC: req.weather?.tempC ?? null,
        apparentTempC: req.weather?.apparentTempC ?? null,
        humidityPct: req.weather?.humidityPct ?? null,
        windSpeedKmh: req.weather?.windSpeedKmh ?? null,
        windDirectionDeg: req.weather?.windDirectionDeg ?? null,
        windGustKmh: req.weather?.windGustKmh ?? null,
        precipMm: req.weather?.precipMm ?? null,
        weatherCode: req.weather?.weatherCode ?? null,
        weatherSource: req.weather?.source ?? null,
        weatherObservedAt: req.weather?.observedAt ? new Date(req.weather.observedAt) : null,
        raw: { samples: req.samples, lapSplits: req.lapSplits ?? [] } as object,
      },
    });

    // Build one Stream per metric that has data.
    const streamsToCreate = buildStreams(req.samples, created.id);
    if (streamsToCreate.length > 0) {
      await this.prisma.stream.createMany({ data: streamsToCreate });
    }

    // Build laps from the split markers. Empty splits → single implicit lap,
    // no rows created.
    const lapsToCreate = buildLaps(
      req.samples,
      req.lapSplits ?? [],
      new Date(req.startedAt),
      stats.durationSec,
      created.id,
    );
    if (lapsToCreate.length > 0) {
      await this.prisma.lap.createMany({ data: lapsToCreate });
    }

    return { activityId: created.id, alreadyExisted: false };
  }

  async get(userId: string, id: string): Promise<ActivityDetail> {
    const row = await this.prisma.activity.findFirst({
      where: { id, userId },
      include: { streams: true, laps: { orderBy: { lapIndex: 'asc' } } },
    });
    if (!row) throw new NotFoundException('Activity not found');
    return {
      ...toDto(row),
      streams: row.streams.map(
        (s): ActivityStream => ({
          type: s.type as ActivityStream['type'],
          resolution: s.resolution as ActivityStream['resolution'],
          data: s.data as ActivityStream['data'],
        }),
      ),
      laps: row.laps.map((l) => ({
        lapIndex: l.lapIndex,
        name: l.name,
        startTime: l.startTime.toISOString(),
        durationSec: l.durationSec,
        distanceM: l.distanceM,
        avgWatts: l.avgWatts,
        avgHeartrate: l.avgHeartrate,
        avgSpeedMps: l.avgSpeedMps,
        elevationGainM: l.elevationGainM,
      })),
    };
  }
}

interface RecordingStats {
  durationSec: number;
  distanceM: number;
  elevationGainM: number | null;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
}

function summarize(
  samples: UploadSample[],
  startedAt: string,
  endedAt: string,
): RecordingStats {
  const durationSec = Math.max(
    0,
    Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000),
  );

  let lastDistance = 0;
  let sumHr = 0,
    countHr = 0,
    maxHr = 0;
  let sumCadence = 0,
    countCadence = 0;
  let maxSpeed = 0;
  let elevGain = 0;
  let prevAlt: number | null = null;

  for (const s of samples) {
    if (s.distanceM != null) lastDistance = s.distanceM;
    if (s.hr != null) {
      sumHr += s.hr;
      countHr++;
      if (s.hr > maxHr) maxHr = s.hr;
    }
    if (s.cadenceRpm != null && s.cadenceRpm > 0) {
      sumCadence += s.cadenceRpm;
      countCadence++;
    }
    if (s.speedMps != null && s.speedMps > maxSpeed) maxSpeed = s.speedMps;
    if (s.altitudeM != null) {
      if (prevAlt != null && s.altitudeM > prevAlt) {
        elevGain += s.altitudeM - prevAlt;
      }
      prevAlt = s.altitudeM;
    }
  }

  return {
    durationSec,
    distanceM: lastDistance,
    elevationGainM: prevAlt != null ? Math.round(elevGain) : null,
    avgSpeedMps:
      lastDistance > 0 && durationSec > 0 ? lastDistance / durationSec : null,
    maxSpeedMps: maxSpeed > 0 ? maxSpeed : null,
    avgHr: countHr > 0 ? sumHr / countHr : null,
    maxHr: countHr > 0 ? maxHr : null,
    avgCadence: countCadence > 0 ? sumCadence / countCadence : null,
  };
}

/**
 * For each metric with at least one non-null value, build a Stream row.
 * Streams are aligned to the sample timeline (1Hz from the mobile recorder),
 * so the `time` stream describes the x-axis for all the others.
 */
function buildStreams(
  samples: UploadSample[],
  activityId: string,
): Array<{
  activityId: string;
  type: string;
  resolution: string;
  data: object;
}> {
  if (samples.length === 0) return [];

  const time = samples.map((s) => Math.round(s.t / 1000));
  const hr = samples.map((s) => s.hr ?? null);
  const cadence = samples.map((s) => s.cadenceRpm ?? null);
  const speed = samples.map((s) => s.speedMps ?? null);
  const distance = samples.map((s) => s.distanceM ?? null);
  const altitude = samples.map((s) => s.altitudeM ?? null);
  const latlng = samples
    .map((s) => (s.lat != null && s.lng != null ? [s.lat, s.lng] : null));

  const streams: Array<{
    type: string;
    data: unknown[];
  }> = [
    { type: 'time', data: time },
    ...(hasValue(hr) ? [{ type: 'heartrate', data: hr }] : []),
    ...(hasValue(cadence) ? [{ type: 'cadence', data: cadence }] : []),
    ...(hasValue(speed) ? [{ type: 'velocity_smooth', data: speed }] : []),
    ...(hasValue(distance) ? [{ type: 'distance', data: distance }] : []),
    ...(hasValue(altitude) ? [{ type: 'altitude', data: altitude }] : []),
    ...(hasValue(latlng) ? [{ type: 'latlng', data: latlng }] : []),
  ];

  return streams.map((s) => ({
    activityId,
    type: s.type,
    resolution: 'high',
    data: s.data as unknown as object,
  }));
}

function hasValue(arr: Array<unknown>): boolean {
  return arr.some((v) => v != null);
}

/**
 * Turn lap split markers into Lap rows by bucketing samples into the windows
 * [0, splits[0]), [splits[0], splits[1]), ..., [splits[N-1], totalDuration].
 *
 * Returns [] if there are no splits — the whole session is one implicit lap
 * and we don't bother persisting a row for it (matches Strava's behavior
 * for laps-less activities).
 */
function buildLaps(
  samples: UploadSample[],
  splits: number[],
  sessionStart: Date,
  totalDurationSec: number,
  activityId: string,
): Array<{
  activityId: string;
  lapIndex: number;
  name: string | null;
  startTime: Date;
  durationSec: number;
  distanceM: number;
  avgWatts: number | null;
  avgHeartrate: number | null;
  avgSpeedMps: number | null;
  elevationGainM: number | null;
}> {
  if (splits.length === 0) return [];
  const totalMs = totalDurationSec * 1000;
  const boundaries = [0, ...splits, totalMs];

  const out: Array<{
    activityId: string;
    lapIndex: number;
    name: string | null;
    startTime: Date;
    durationSec: number;
    distanceM: number;
    avgWatts: number | null;
    avgHeartrate: number | null;
    avgSpeedMps: number | null;
    elevationGainM: number | null;
  }> = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const startMs = boundaries[i];
    const endMs = boundaries[i + 1];
    const lapSamples = samples.filter((s) => s.t >= startMs && s.t < endMs);

    let firstDist: number | null = null;
    let lastDist: number | null = null;
    let sumHr = 0,
      countHr = 0;
    let sumSpeed = 0,
      countSpeed = 0;
    let elevGain = 0;
    let prevAlt: number | null = null;

    for (const s of lapSamples) {
      if (s.distanceM != null) {
        if (firstDist == null) firstDist = s.distanceM;
        lastDist = s.distanceM;
      }
      if (s.hr != null) {
        sumHr += s.hr;
        countHr++;
      }
      if (s.speedMps != null) {
        sumSpeed += s.speedMps;
        countSpeed++;
      }
      if (s.altitudeM != null) {
        if (prevAlt != null && s.altitudeM > prevAlt) {
          elevGain += s.altitudeM - prevAlt;
        }
        prevAlt = s.altitudeM;
      }
    }

    out.push({
      activityId,
      lapIndex: i + 1,
      name: null,
      startTime: new Date(sessionStart.getTime() + startMs),
      durationSec: Math.max(0, Math.round((endMs - startMs) / 1000)),
      distanceM:
        firstDist != null && lastDist != null ? lastDist - firstDist : 0,
      avgWatts: null,
      avgHeartrate: countHr > 0 ? sumHr / countHr : null,
      avgSpeedMps: countSpeed > 0 ? sumSpeed / countSpeed : null,
      elevationGainM: prevAlt != null ? Math.round(elevGain) : null,
    });
  }

  return out;
}

function defaultName(startedAt: string): string {
  const d = new Date(startedAt);
  const hour = d.getHours();
  const part =
    hour < 5 ? 'Late night' : hour < 11 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  return `${part} ride`;
}

function toDto(a: {
  id: string;
  userId: string;
  source: string;
  sourceId: string;
  name: string;
  sportType: string;
  startTime: Date;
  timezone: string | null;
  durationSec: number;
  elapsedSec: number;
  distanceM: number;
  elevationGainM: number | null;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  avgWatts: number | null;
  weightedAvgWatts: number | null;
  maxWatts: number | null;
  kilojoules: number | null;
  avgHeartrate: number | null;
  maxHeartrate: number | null;
  avgCadence: number | null;
  trainerActivity: boolean;
  commute: boolean;
  tempC: number | null;
  apparentTempC: number | null;
  humidityPct: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  windGustKmh: number | null;
  precipMm: number | null;
  weatherCode: number | null;
  weatherSource: string | null;
  weatherObservedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Activity {
  return {
    ...a,
    source: a.source as Activity['source'],
    startTime: a.startTime.toISOString(),
    weatherObservedAt: a.weatherObservedAt ? a.weatherObservedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
