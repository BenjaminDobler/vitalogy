import { inject, Injectable, signal } from '@angular/core';
import type { UserProfile, Workout, WorkoutStatus } from 'data-models';
import type { AthleteParams } from 'training-metrics';
import { ApiClient } from './api-client.service';

const DEFAULT_ATHLETE: AthleteParams = {
  ftpW: 200,
  maxHrBpm: 190,
  restHrBpm: 60,
};

/**
 * Mobile-side workouts client. List / get / mark complete, plus a
 * profile-fetch shortcut so the live workout overlay can resolve
 * HR_ZONE and POWER_FTP_PCT targets to real numbers.
 *
 * Falls back to sensible defaults when the server is unreachable so an
 * offline ride against a workout still gets meaningful guidance (just
 * tuned to a generic 200W / 190bpm athlete).
 */
@Injectable({ providedIn: 'root' })
export class WorkoutsService {
  private readonly api = inject(ApiClient);

  /** Last-fetched athlete params, cached for the session. */
  readonly athlete = signal<AthleteParams>(DEFAULT_ATHLETE);

  async listPending(): Promise<Workout[]> {
    return await this.api.get<Workout[]>('/api/workouts?pending=true');
  }

  async get(id: string): Promise<Workout> {
    return await this.api.get<Workout>(`/api/workouts/${id}`);
  }

  /** Mark IN_PROGRESS (stamps startedAt server-side). */
  async start(id: string): Promise<Workout> {
    return await this.api.patch<Workout>(`/api/workouts/${id}`, {
      status: 'IN_PROGRESS' as WorkoutStatus,
    });
  }

  /** Mark COMPLETED and link the activity. */
  async complete(id: string, activityId: string): Promise<Workout> {
    return await this.api.patch<Workout>(`/api/workouts/${id}`, {
      status: 'COMPLETED' as WorkoutStatus,
      activityId,
    });
  }

  /**
   * Fetch the user's profile and cache athlete params for target
   * resolution. Best-effort: leaves defaults in place on failure.
   */
  async refreshAthlete(): Promise<AthleteParams> {
    try {
      const p = await this.api.get<UserProfile>('/api/profile');
      const next: AthleteParams = {
        ftpW: p.ftpW ?? DEFAULT_ATHLETE.ftpW,
        maxHrBpm: p.maxHrBpm ?? DEFAULT_ATHLETE.maxHrBpm,
        restHrBpm: p.restHrBpm ?? DEFAULT_ATHLETE.restHrBpm,
      };
      this.athlete.set(next);
      return next;
    } catch {
      return this.athlete();
    }
  }
}
