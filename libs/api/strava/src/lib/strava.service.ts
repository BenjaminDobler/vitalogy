import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'db';
import type { StravaSummaryActivity } from 'data-models';

const STRAVA_OAUTH_BASE = 'https://www.strava.com/oauth';
export const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
const DEFAULT_SCOPE = 'read,activity:read_all,profile:read_all';

@Injectable()
export class StravaService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** URL to send the user to so they can authorize the app. */
  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.requireConfig('STRAVA_CLIENT_ID'),
      redirect_uri: this.requireConfig('STRAVA_REDIRECT_URI'),
      response_type: 'code',
      approval_prompt: 'auto',
      scope: DEFAULT_SCOPE,
      state,
    });
    return `${STRAVA_OAUTH_BASE}/authorize?${params}`;
  }

  /** Exchange the OAuth code for tokens and persist them against `userId`. */
  async handleCallback(userId: string, code: string): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.requireConfig('STRAVA_CLIENT_ID'),
      client_secret: this.requireConfig('STRAVA_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
    });
    const res = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new Error(`Strava token exchange failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
      athlete: { id: number; firstname?: string; lastname?: string };
      scope?: string;
    };

    // Single-user dev mode: ensure the User row exists before linking the
    // StravaAccount (FK constraint). Replace with real auth later.
    await this.prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: `${userId}@local.vitalogy`,
        name: [data.athlete.firstname, data.athlete.lastname].filter(Boolean).join(' ') || null,
      },
      update: {},
    });

    await this.prisma.stravaAccount.upsert({
      where: { userId },
      create: {
        userId,
        athleteId: BigInt(data.athlete.id),
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(data.expires_at * 1000),
        scope: data.scope ?? DEFAULT_SCOPE,
      },
      update: {
        athleteId: BigInt(data.athlete.id),
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(data.expires_at * 1000),
        scope: data.scope ?? DEFAULT_SCOPE,
      },
    });
  }

  /** Fetch recent activities from Strava and upsert them into the DB. */
  async importRecent(
    userId: string,
    opts: { perPage?: number; page?: number } = {},
  ): Promise<number> {
    const account = await this.prisma.stravaAccount.findUnique({ where: { userId } });
    if (!account) {
      throw new Error('No Strava account connected for this user. Visit /api/auth/strava/start first.');
    }

    const accessToken = await this.ensureFreshToken(account);

    const perPage = opts.perPage ?? 30;
    const page = opts.page ?? 1;
    const res = await fetch(
      `${STRAVA_API_BASE}/athlete/activities?per_page=${perPage}&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new Error(`Strava activities fetch failed: ${res.status} ${await res.text()}`);
    }
    const summaries = (await res.json()) as StravaSummaryActivity[];

    let imported = 0;
    for (const s of summaries) {
      const input = StravaService.toActivityInput(s);
      await this.prisma.activity.upsert({
        where: { source_sourceId: { source: 'STRAVA', sourceId: input.sourceId } },
        create: { ...input, userId, raw: s as unknown as object },
        update: { ...input, raw: s as unknown as object },
      });
      imported++;
    }
    return imported;
  }

  /**
   * Fetch full detail (incl. laps) and streams for one activity and persist them.
   * `activityId` is our local Activity.id.
   *
   * By default this is a no-op if streams already exist for the activity, so it's
   * safe to call repeatedly without burning Strava rate limit. Pass `force: true`
   * to re-fetch (e.g. if you suspect Strava data was edited).
   */
  async importDetail(
    userId: string,
    activityId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ streams: number; laps: number; cached: boolean }> {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, userId },
    });
    if (!activity) {
      throw new Error(`Activity not found: ${activityId}`);
    }

    if (!opts.force) {
      const [existingStreams, existingLaps] = await Promise.all([
        this.prisma.stream.count({ where: { activityId } }),
        this.prisma.lap.count({ where: { activityId } }),
      ]);
      if (existingStreams > 0) {
        return { streams: existingStreams, laps: existingLaps, cached: true };
      }
    }

    // Non-Strava activities (manual uploads, future FIT/TCX/GPX imports) come
    // complete with streams and laps already populated by their importer.
    // There's nothing to fetch from a remote source — treat as cached so the
    // web detail page's universal "make sure detail is loaded" call succeeds.
    if (activity.source !== 'STRAVA') {
      const [streams, laps] = await Promise.all([
        this.prisma.stream.count({ where: { activityId } }),
        this.prisma.lap.count({ where: { activityId } }),
      ]);
      return { streams, laps, cached: true };
    }

    const account = await this.prisma.stravaAccount.findUnique({ where: { userId } });
    if (!account) {
      throw new Error('No Strava account connected for this user.');
    }
    const accessToken = await this.ensureFreshToken(account);

    const [detail, streams] = await Promise.all([
      this.fetchDetail(accessToken, activity.sourceId),
      this.fetchStreams(accessToken, activity.sourceId),
    ]);

    // Update the activity with any fields that detail provides more accurately.
    await this.prisma.activity.update({
      where: { id: activityId },
      data: { raw: detail as unknown as object },
    });

    // Upsert laps. Strava can return null `laps` for activities without splits.
    const laps = detail.laps ?? [];
    for (const lap of laps) {
      await this.prisma.lap.upsert({
        where: { activityId_lapIndex: { activityId, lapIndex: lap.lap_index } },
        create: {
          activityId,
          lapIndex: lap.lap_index,
          name: lap.name ?? null,
          startTime: new Date(lap.start_date),
          durationSec: lap.moving_time,
          distanceM: lap.distance,
          avgWatts: lap.average_watts ?? null,
          avgHeartrate: lap.average_heartrate ?? null,
          avgSpeedMps: lap.average_speed ?? null,
          elevationGainM: lap.total_elevation_gain ?? null,
        },
        update: {
          name: lap.name ?? null,
          startTime: new Date(lap.start_date),
          durationSec: lap.moving_time,
          distanceM: lap.distance,
          avgWatts: lap.average_watts ?? null,
          avgHeartrate: lap.average_heartrate ?? null,
          avgSpeedMps: lap.average_speed ?? null,
          elevationGainM: lap.total_elevation_gain ?? null,
        },
      });
    }

    // Upsert streams. Strava returns one entry per requested key (only if data exists).
    let streamCount = 0;
    for (const [type, stream] of Object.entries(streams)) {
      await this.prisma.stream.upsert({
        where: {
          activityId_type_resolution: {
            activityId,
            type,
            resolution: stream.resolution ?? 'high',
          },
        },
        create: {
          activityId,
          type,
          resolution: stream.resolution ?? 'high',
          data: stream.data as unknown as object,
        },
        update: {
          data: stream.data as unknown as object,
        },
      });
      streamCount++;
    }

    return { streams: streamCount, laps: laps.length, cached: false };
  }

  /**
   * Bulk-import detail for every locally-stored Strava activity that doesn't yet
   * have streams. Sequential with a small delay between calls to be polite to
   * Strava's rate limit (~100 read req / 15 min). Caller can cap with `max`.
   */
  async importMissingDetails(
    userId: string,
    opts: { max?: number; delayMs?: number } = {},
  ): Promise<{
    candidates: number;
    processed: number;
    imported: number;
    failed: number;
    errors: { activityId: string; error: string }[];
  }> {
    const candidates = await this.prisma.activity.findMany({
      where: {
        userId,
        source: 'STRAVA',
        streams: { none: {} },
      },
      select: { id: true },
      orderBy: { startTime: 'desc' },
    });

    const max = opts.max ?? 50;
    const delayMs = opts.delayMs ?? 200;
    const toProcess = candidates.slice(0, max);

    let imported = 0;
    let failed = 0;
    const errors: { activityId: string; error: string }[] = [];

    for (let i = 0; i < toProcess.length; i++) {
      try {
        const result = await this.importDetail(userId, toProcess[i].id);
        // `cached` shouldn't happen here since we filtered for activities
        // without streams, but count defensively.
        if (!result.cached) imported++;
      } catch (err) {
        failed++;
        errors.push({
          activityId: toProcess[i].id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (i < toProcess.length - 1 && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    return {
      candidates: candidates.length,
      processed: toProcess.length,
      imported,
      failed,
      errors,
    };
  }

  private async fetchDetail(accessToken: string, sourceId: string): Promise<StravaDetailedActivity> {
    const res = await fetch(
      `${STRAVA_API_BASE}/activities/${sourceId}?include_all_efforts=false`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new Error(`Strava activity detail failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as StravaDetailedActivity;
  }

  private async fetchStreams(accessToken: string, sourceId: string): Promise<StravaStreamSet> {
    const keys = [
      'time',
      'distance',
      'latlng',
      'altitude',
      'velocity_smooth',
      'heartrate',
      'cadence',
      'watts',
      'temp',
      'moving',
      'grade_smooth',
    ].join(',');
    const res = await fetch(
      `${STRAVA_API_BASE}/activities/${sourceId}/streams?keys=${keys}&key_by_type=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new Error(`Strava streams failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as StravaStreamSet;
  }

  /** Returns a valid access token, refreshing it if it has (almost) expired. */
  private async ensureFreshToken(account: {
    userId: string;
    refreshToken: string;
    accessToken: string;
    expiresAt: Date;
  }): Promise<string> {
    const expiresSoon = account.expiresAt.getTime() - Date.now() < 60_000;
    if (!expiresSoon) return account.accessToken;

    const body = new URLSearchParams({
      client_id: this.requireConfig('STRAVA_CLIENT_ID'),
      client_secret: this.requireConfig('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
    });
    const res = await fetch(`${STRAVA_OAUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new Error(`Strava token refresh failed: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
    };
    await this.prisma.stravaAccount.update({
      where: { userId: account.userId },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(data.expires_at * 1000),
      },
    });
    return data.access_token;
  }

  /** Maps a Strava summary payload to the wire shape we'd store. */
  static toActivityInput(s: StravaSummaryActivity) {
    return {
      source: 'STRAVA' as const,
      sourceId: String(s.id),
      name: s.name,
      sportType: s.sport_type,
      startTime: new Date(s.start_date),
      timezone: s.timezone,
      durationSec: s.moving_time,
      elapsedSec: s.elapsed_time,
      distanceM: s.distance,
      elevationGainM: s.total_elevation_gain,
      avgSpeedMps: s.average_speed,
      maxSpeedMps: s.max_speed,
      avgWatts: s.average_watts ?? null,
      weightedAvgWatts: s.weighted_average_watts ?? null,
      maxWatts: s.max_watts ?? null,
      kilojoules: s.kilojoules ?? null,
      avgHeartrate: s.average_heartrate ?? null,
      maxHeartrate: s.max_heartrate ?? null,
      avgCadence: s.average_cadence ?? null,
      trainerActivity: s.trainer,
      commute: s.commute,
    };
  }

  private requireConfig(key: string): string {
    const v = this.config.get<string>(key);
    if (!v) throw new Error(`Missing config: ${key}`);
    return v;
  }
}

interface StravaLap {
  lap_index: number;
  name?: string;
  start_date: string;
  moving_time: number;
  elapsed_time: number;
  distance: number;
  total_elevation_gain?: number;
  average_speed?: number;
  average_watts?: number;
  average_heartrate?: number;
}

interface StravaDetailedActivity extends StravaSummaryActivity {
  laps?: StravaLap[];
  description?: string;
  device_name?: string;
}

interface StravaStream {
  data: number[] | [number, number][];
  series_type?: string;
  original_size?: number;
  resolution?: 'low' | 'medium' | 'high';
}

type StravaStreamSet = Record<string, StravaStream>;

