import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'db';
import type {
  AchievementActivityStub,
  AchievementsResponse,
  Activity,
  ActivityDetail,
  ActivityStream,
  DailyLoadPoint,
  TrainingLoadResponse,
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

    const stats = summarize(
      req.samples,
      req.startedAt,
      req.endedAt,
      req.pauseSegments ?? [],
    );

    const created = await this.prisma.activity.create({
      data: {
        userId,
        source: 'MANUAL',
        sourceId: req.sessionId,
        name: req.name ?? defaultName(req.startedAt),
        sportType: req.sportType ?? 'Ride',
        startTime: new Date(req.startedAt),
        timezone: null,
        durationSec: stats.movingSec,
        elapsedSec: stats.elapsedSec,
        distanceM: stats.distanceM,
        elevationGainM: stats.elevationGainM,
        avgSpeedMps: stats.avgSpeedMps,
        maxSpeedMps: stats.maxSpeedMps,
        avgWatts: stats.avgWatts,
        weightedAvgWatts: null,
        maxWatts: stats.maxWatts != null ? Math.round(stats.maxWatts) : null,
        kilojoules:
          stats.avgWatts != null && stats.movingSec > 0
            ? Math.round((stats.avgWatts * stats.movingSec) / 1000)
            : null,
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
      stats.elapsedSec,
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

  /**
   * Lifetime PRs across the user's activities. Six categories — one
   * activity may hold multiple. Each entry includes the source activity
   * stub so the UI can link straight to its detail page.
   */
  async achievements(userId: string): Promise<AchievementsResponse> {
    const pickActivity = async (orderBy: Record<string, 'desc'>, where?: object) =>
      this.prisma.activity.findFirst({
        where: { userId, ...(where ?? {}) },
        orderBy,
        select: {
          id: true,
          name: true,
          startTime: true,
          distanceM: true,
          elevationGainM: true,
          durationSec: true,
          avgSpeedMps: true,
          maxSpeedMps: true,
          sportType: true,
        },
      });

    const [
      longest,
      mostElev,
      longestTime,
      fastestAvg,
      highestMax,
    ] = await Promise.all([
      pickActivity({ distanceM: 'desc' }),
      pickActivity({ elevationGainM: 'desc' }, { elevationGainM: { not: null } }),
      pickActivity({ durationSec: 'desc' }),
      pickActivity({ avgSpeedMps: 'desc' }, { avgSpeedMps: { not: null } }),
      pickActivity({ maxSpeedMps: 'desc' }, { maxSpeedMps: { not: null } }),
    ]);

    // Best lap by avg speed across all activities (only for laps that have
    // a recorded avg speed — Strava sometimes returns null).
    const bestLap = await this.prisma.lap.findFirst({
      where: {
        avgSpeedMps: { not: null },
        activity: { userId },
      },
      orderBy: { avgSpeedMps: 'desc' },
      select: {
        lapIndex: true,
        avgSpeedMps: true,
        distanceM: true,
        durationSec: true,
        activity: {
          select: { id: true, name: true, startTime: true, sportType: true },
        },
      },
    });

    const toStub = (
      a: NonNullable<Awaited<ReturnType<typeof pickActivity>>>,
    ): AchievementActivityStub => ({
      id: a.id,
      name: a.name,
      startTime: a.startTime.toISOString(),
      sportType: a.sportType,
    });

    return {
      longestDistance:
        longest && longest.distanceM > 0
          ? { activity: toStub(longest), valueM: longest.distanceM }
          : null,
      mostElevation:
        mostElev && mostElev.elevationGainM != null
          ? { activity: toStub(mostElev), valueM: mostElev.elevationGainM }
          : null,
      longestDuration:
        longestTime && longestTime.durationSec > 0
          ? {
              activity: toStub(longestTime),
              valueSec: longestTime.durationSec,
            }
          : null,
      highestAvgSpeed:
        fastestAvg && fastestAvg.avgSpeedMps != null
          ? {
              activity: toStub(fastestAvg),
              valueMps: fastestAvg.avgSpeedMps,
            }
          : null,
      highestMaxSpeed:
        highestMax && highestMax.maxSpeedMps != null
          ? {
              activity: toStub(highestMax),
              valueMps: highestMax.maxSpeedMps,
            }
          : null,
      fastestLap:
        bestLap && bestLap.avgSpeedMps != null
          ? {
              activity: {
                id: bestLap.activity.id,
                name: bestLap.activity.name,
                startTime: bestLap.activity.startTime.toISOString(),
                sportType: bestLap.activity.sportType,
              },
              lapIndex: bestLap.lapIndex,
              valueMps: bestLap.avgSpeedMps,
              distanceM: bestLap.distanceM,
              durationSec: bestLap.durationSec,
            }
          : null,
    };
  }

  /**
   * Daily training load + Banister CTL/ATL/TSB EWMAs across the last N days.
   *
   * Per-ride load = TSS when avgWatts exists, Banister TRIMP from avgHr +
   * HR-reserve otherwise. Days with no rides contribute 0 — both EWMAs
   * still decay over them.
   */
  async trainingLoad(
    userId: string,
    opts: { days?: number; ftp?: number; maxHr?: number; restHr?: number } = {},
  ): Promise<TrainingLoadResponse> {
    const days = clampInt(opts.days ?? 90, 7, 365);
    const ftp = clampInt(opts.ftp ?? 200, 50, 600);
    const maxHr = clampInt(opts.maxHr ?? 190, 100, 250);
    const restHr = clampInt(opts.restHr ?? 60, 30, 120);

    // We pull a 42-day pre-roll so the CTL EWMA enters the visible window
    // already warmed up — otherwise the first weeks look misleadingly low.
    const preRollDays = 42;
    const start = startOfUtcDay(new Date());
    start.setUTCDate(start.getUTCDate() - (days + preRollDays - 1));

    const rides = await this.prisma.activity.findMany({
      where: {
        userId,
        startTime: { gte: start },
      },
      select: {
        startTime: true,
        durationSec: true,
        avgWatts: true,
        avgHeartrate: true,
      },
      orderBy: { startTime: 'asc' },
    });

    // Bucket rides by UTC date and sum their loads.
    const loadByDate = new Map<string, number>();
    for (const r of rides) {
      const key = isoDate(r.startTime);
      const load = computeRideLoad({
        durationSec: r.durationSec,
        avgWatts: r.avgWatts,
        avgHr: r.avgHeartrate,
        ftp,
        maxHr,
        restHr,
      });
      if (load > 0) {
        loadByDate.set(key, (loadByDate.get(key) ?? 0) + load);
      }
    }

    // Walk every day in [start, today] forward, running the two EWMAs.
    const today = startOfUtcDay(new Date());
    const series: DailyLoadPoint[] = [];
    let ctl = 0;
    let atl = 0;
    const cursor = new Date(start);
    while (cursor <= today) {
      const key = isoDate(cursor);
      const load = loadByDate.get(key) ?? 0;
      ctl = ctl + (load - ctl) / 42;
      atl = atl + (load - atl) / 7;
      series.push({
        date: key,
        load: Math.round(load * 10) / 10,
        ctl: Math.round(ctl * 10) / 10,
        atl: Math.round(atl * 10) / 10,
        tsb: Math.round((ctl - atl) * 10) / 10,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // Trim the pre-roll for the wire response — only the visible window.
    const visible = series.slice(-days);
    const last = visible[visible.length - 1] ?? {
      ctl: 0,
      atl: 0,
      tsb: 0,
    };
    const trend: 'building' | 'maintaining' | 'tapering' =
      last.atl > last.ctl + 5
        ? 'building'
        : last.ctl > last.atl + 5
          ? 'tapering'
          : 'maintaining';

    return {
      daily: visible,
      current: {
        ctl: last.ctl,
        atl: last.atl,
        tsb: last.tsb,
        trend,
      },
      inputs: { ftp, maxHr, restHr, days },
    };
  }
}

/**
 * Per-ride load score. Prefers TSS from avgWatts (rougher than NP but
 * the magnitude is right for trend purposes); falls back to Banister
 * TRIMP from avgHr + HR-reserve when there's no power data.
 */
function computeRideLoad(args: {
  durationSec: number;
  avgWatts: number | null;
  avgHr: number | null;
  ftp: number;
  maxHr: number;
  restHr: number;
}): number {
  const { durationSec } = args;
  if (durationSec <= 0) return 0;

  if (args.avgWatts != null && args.avgWatts > 0 && args.ftp > 0) {
    const intensity = args.avgWatts / args.ftp;
    return (durationSec * args.avgWatts * intensity) / (args.ftp * 3600) * 100;
  }
  if (
    args.avgHr != null &&
    args.avgHr > 0 &&
    args.maxHr > args.restHr
  ) {
    const hrr = Math.max(
      0,
      Math.min(1, (args.avgHr - args.restHr) / (args.maxHr - args.restHr)),
    );
    const minutes = durationSec / 60;
    return minutes * hrr * 0.64 * Math.exp(1.92 * hrr);
  }
  return 0;
}

function startOfUtcDay(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(v)));
}


interface RecordingStats {
  /** Total wall-clock duration in seconds. */
  elapsedSec: number;
  /** Moving time (elapsed minus paused) in seconds. */
  movingSec: number;
  distanceM: number;
  elevationGainM: number | null;
  avgSpeedMps: number | null;
  maxSpeedMps: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  avgWatts: number | null;
  maxWatts: number | null;
}

function summarize(
  samples: UploadSample[],
  startedAt: string,
  endedAt: string,
  pauseSegments: Array<{ start: number; end: number }>,
): RecordingStats {
  const elapsedSec = Math.max(
    0,
    Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000),
  );
  const pausedSec = Math.round(
    pauseSegments.reduce((acc, seg) => acc + Math.max(0, seg.end - seg.start), 0) /
      1000,
  );
  const movingSec = Math.max(0, elapsedSec - pausedSec);
  const elapsedMs = elapsedSec * 1000;

  let sumHr = 0,
    countHr = 0,
    maxHr = 0;
  let sumCadence = 0,
    countCadence = 0;
  let maxSpeed = 0;
  let sumWatts = 0,
    countWatts = 0,
    maxWatts = 0;
  let elevGain = 0;
  let prevAlt: number | null = null;

  for (const s of samples) {
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
    if (s.watts != null) {
      sumWatts += s.watts;
      countWatts++;
      if (s.watts > maxWatts) maxWatts = s.watts;
    }
    if (s.altitudeM != null) {
      if (prevAlt != null && s.altitudeM > prevAlt) {
        elevGain += s.altitudeM - prevAlt;
      }
      prevAlt = s.altitudeM;
    }
  }

  // CSC sensors report cumulative distance since sensor power-on, not
  // session start. Distance is the delta between first and last observed
  // cumulative readings, extrapolated at both boundaries using the
  // bracketing samples' speed (otherwise the first/last fraction-of-a-
  // second is lost — material for short rides).
  const sessionDistance = windowDistance(samples, 0, elapsedMs);

  return {
    elapsedSec,
    movingSec,
    distanceM: sessionDistance,
    elevationGainM: prevAlt != null ? Math.round(elevGain) : null,
    avgSpeedMps:
      sessionDistance > 0 && movingSec > 0
        ? sessionDistance / movingSec
        : null,
    maxSpeedMps: maxSpeed > 0 ? maxSpeed : null,
    avgHr: countHr > 0 ? sumHr / countHr : null,
    maxHr: countHr > 0 ? maxHr : null,
    avgCadence: countCadence > 0 ? sumCadence / countCadence : null,
    avgWatts: countWatts > 0 ? sumWatts / countWatts : null,
    maxWatts: countWatts > 0 ? maxWatts : null,
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
  const watts = samples.map((s) => s.watts ?? null);
  // Rebase cumulative-from-sensor distance to cumulative-from-session-start
  // so the stream + downstream consumers (charts, TCX export, etc.) see
  // 0 at t=0 instead of whatever the sensor had counted before recording.
  const distance = rebaseDistance(samples);
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
    ...(hasValue(watts) ? [{ type: 'watts', data: watts }] : []),
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
 * Rebase cumulative-from-sensor distance to cumulative-from-session-start.
 * Anchors the implied "t=0" cumulative by extrapolating the first sample
 * backwards using its speed, so the stream starts at the actual distance
 * the rider had moved before the first reading rather than at zero. Nulls
 * pass through.
 */
function rebaseDistance(samples: UploadSample[]): (number | null)[] {
  const firstWithDist = samples.find((s) => s.distanceM != null);
  if (!firstWithDist) return samples.map(() => null);
  const firstDist = firstWithDist.distanceM as number;
  const firstSpeed = firstWithDist.speedMps ?? 0;
  // Estimated cumulative at session start (t=0).
  const baseAtStart = firstDist - (firstSpeed * firstWithDist.t) / 1000;
  return samples.map((s) =>
    s.distanceM != null ? Math.max(0, s.distanceM - baseAtStart) : null,
  );
}

/**
 * Total distance moved during [startMs, endMs] from CSC cumulative readings,
 * extrapolated at both boundaries using the bracketing samples' speed.
 * See the mobile recording.service.ts copy for the formula rationale.
 */
function windowDistance(
  samples: UploadSample[],
  startMs: number,
  endMs: number,
): number {
  let firstSample: UploadSample | null = null;
  let lastSample: UploadSample | null = null;
  for (const s of samples) {
    if (s.t < startMs || s.t > endMs) continue;
    if (s.distanceM != null) {
      if (firstSample == null) firstSample = s;
      lastSample = s;
    }
  }
  if (
    !firstSample ||
    !lastSample ||
    firstSample.distanceM == null ||
    lastSample.distanceM == null
  ) {
    return 0;
  }
  const sensorDelta = lastSample.distanceM - firstSample.distanceM;
  const leadIn =
    (firstSample.speedMps ?? 0) *
    Math.max(0, (firstSample.t - startMs) / 1000);
  const trailOut =
    (lastSample.speedMps ?? 0) * Math.max(0, (endMs - lastSample.t) / 1000);
  return Math.max(0, sensorDelta + leadIn + trailOut);
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
  stravaExportId: string | null;
  stravaActivityId: string | null;
  stravaExportedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Activity {
  return {
    ...a,
    source: a.source as Activity['source'],
    startTime: a.startTime.toISOString(),
    weatherObservedAt: a.weatherObservedAt ? a.weatherObservedAt.toISOString() : null,
    stravaExportedAt: a.stravaExportedAt ? a.stravaExportedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
