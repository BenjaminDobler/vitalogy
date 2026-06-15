import { Injectable } from '@nestjs/common';
import { PrismaService } from 'db';
import type { UserProfile, UserProfileUpdate } from 'data-models';

/**
 * Per-athlete profile + training settings. Lazy-creates an empty profile row
 * on first read so the client never sees a 404 for a fresh user. Update is
 * upsert-style — pass only the fields you want to change.
 */
@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<UserProfile> {
    await this.ensureUser(userId);
    const row = await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return toDto(row);
  }

  async update(userId: string, patch: UserProfileUpdate): Promise<UserProfile> {
    await this.ensureUser(userId);
    const data = {
      birthdate: patch.birthdate != null ? new Date(patch.birthdate) : null,
      weightKg: patch.weightKg ?? null,
      heightCm: patch.heightCm ?? null,
      sportPrimary: patch.sportPrimary ?? null,
      ftpW: patch.ftpW ?? null,
      maxHrBpm: patch.maxHrBpm ?? null,
      restHrBpm: patch.restHrBpm ?? null,
      weightGoalKg: patch.weightGoalKg ?? null,
      ftpGoalW: patch.ftpGoalW ?? null,
    };
    const row = await this.prisma.userProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return toDto(row);
  }

  /**
   * Make sure the parent User row exists before touching profile — the
   * dev-user middleware lazily inserts users elsewhere, but profile is
   * routinely the first thing a fresh client requests.
   */
  private async ensureUser(userId: string): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: userId },
      create: { id: userId, email: `${userId}@local.vitalogy` },
      update: {},
    });
  }
}

function toDto(row: {
  birthdate: Date | null;
  weightKg: number | null;
  heightCm: number | null;
  sportPrimary: string | null;
  ftpW: number | null;
  maxHrBpm: number | null;
  restHrBpm: number | null;
  weightGoalKg: number | null;
  ftpGoalW: number | null;
}): UserProfile {
  return {
    birthdate: row.birthdate ? row.birthdate.toISOString().slice(0, 10) : null,
    weightKg: row.weightKg,
    heightCm: row.heightCm,
    sportPrimary: row.sportPrimary,
    ftpW: row.ftpW,
    maxHrBpm: row.maxHrBpm,
    restHrBpm: row.restHrBpm,
    weightGoalKg: row.weightGoalKg,
    ftpGoalW: row.ftpGoalW,
  };
}
