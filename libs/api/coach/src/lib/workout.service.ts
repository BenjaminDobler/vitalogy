import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'db';
import type {
  Workout,
  WorkoutCreate,
  WorkoutInterval,
  WorkoutStatus,
  WorkoutUpdate,
} from 'data-models';

/**
 * Planned workouts — sequences of timed intervals with a target.
 *
 * Created by the AI coach during chat (via the create_workout tool) or
 * by the user from the web. The mobile recorder consumes them, overlays
 * live "are you on target?" feedback, and marks them complete on stop.
 */
@Injectable()
export class WorkoutService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    opts: { status?: WorkoutStatus; pendingOnly?: boolean } = {},
  ): Promise<Workout[]> {
    const where: { userId: string; status?: WorkoutStatus | { in: WorkoutStatus[] } } = { userId };
    if (opts.status) {
      where.status = opts.status;
    } else if (opts.pendingOnly) {
      where.status = { in: ['PLANNED', 'IN_PROGRESS'] };
    }
    const rows = await this.prisma.workout.findMany({
      where,
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map(toDto);
  }

  async get(userId: string, id: string): Promise<Workout> {
    const row = await this.prisma.workout.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Workout not found');
    return toDto(row);
  }

  async create(userId: string, input: WorkoutCreate): Promise<Workout> {
    await this.ensureUser(userId);
    const intervals = sanitizeIntervals(input.intervals);
    const totalSec = intervals.reduce((acc, i) => acc + i.durationSec, 0);
    const row = await this.prisma.workout.create({
      data: {
        userId,
        title: input.title,
        description: input.description ?? null,
        intervals: intervals as unknown as object,
        totalSec,
        estimatedTss: input.estimatedTss ?? null,
        scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
        createdBy: input.createdBy ?? 'USER',
      },
    });
    return toDto(row);
  }

  async update(userId: string, id: string, patch: WorkoutUpdate): Promise<Workout> {
    const existing = await this.prisma.workout.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Workout not found');

    const intervals = patch.intervals ? sanitizeIntervals(patch.intervals) : undefined;
    const totalSec = intervals
      ? intervals.reduce((acc, i) => acc + i.durationSec, 0)
      : undefined;

    const row = await this.prisma.workout.update({
      where: { id },
      data: {
        ...(patch.title != null ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(intervals ? { intervals: intervals as unknown as object } : {}),
        ...(totalSec != null ? { totalSec } : {}),
        ...(patch.status ? this.statusTransitionData(patch.status) : {}),
        ...(patch.scheduledFor !== undefined
          ? {
              scheduledFor: patch.scheduledFor ? new Date(patch.scheduledFor) : null,
            }
          : {}),
        ...(patch.activityId !== undefined ? { activityId: patch.activityId } : {}),
      },
    });
    return toDto(row);
  }

  /**
   * One-shot called by the recorder when a session that started against
   * this workout stops. Marks COMPLETED and links the activity.
   */
  async complete(userId: string, id: string, activityId: string): Promise<Workout> {
    return this.update(userId, id, {
      status: 'COMPLETED',
      activityId,
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.workout.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Workout not found');
    await this.prisma.workout.delete({ where: { id } });
  }

  /** Stamp startedAt / completedAt automatically with the matching transition. */
  private statusTransitionData(status: WorkoutStatus): Record<string, unknown> {
    const now = new Date();
    if (status === 'IN_PROGRESS') return { status, startedAt: now };
    if (status === 'COMPLETED') return { status, completedAt: now };
    return { status };
  }

  private async ensureUser(userId: string): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email: `${userId}@local.vitalogy` },
      update: {},
    });
  }
}

function sanitizeIntervals(raw: WorkoutInterval[]): WorkoutInterval[] {
  return raw
    .map((iv, idx) => ({
      index: idx,
      label: iv.label?.trim() || `Interval ${idx + 1}`,
      durationSec: Math.max(5, Math.round(iv.durationSec)),
      target: iv.target,
      cue: iv.cue,
    }))
    .filter((iv) => iv.durationSec > 0);
}

function toDto(row: {
  id: string;
  title: string;
  description: string | null;
  intervals: unknown;
  totalSec: number;
  estimatedTss: number | null;
  status: string;
  scheduledFor: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  activityId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}): Workout {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    intervals: Array.isArray(row.intervals)
      ? (row.intervals as WorkoutInterval[])
      : [],
    totalSec: row.totalSec,
    estimatedTss: row.estimatedTss,
    status: row.status as WorkoutStatus,
    scheduledFor: row.scheduledFor?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    activityId: row.activityId,
    createdBy: row.createdBy as Workout['createdBy'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
