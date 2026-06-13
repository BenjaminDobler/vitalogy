import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'db';
import type { Activity, ActivityDetail, ActivityStream } from 'data-models';

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
  createdAt: Date;
  updatedAt: Date;
}): Activity {
  return {
    ...a,
    source: a.source as Activity['source'],
    startTime: a.startTime.toISOString(),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
