/**
 * Structured workouts — a sequence of timed intervals with a target
 * (HR zone, HR range, power range, or % FTP). Created by the AI coach
 * during chat or by the user manually, then executed live on the mobile
 * recorder.
 */

export type WorkoutStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED';

export type IntervalTargetKind =
  | 'HR_ZONE'        // 1–5, server uses athlete's maxHr to derive bpm range
  | 'HR_RANGE'       // explicit bpm window
  | 'POWER_RANGE'    // explicit watt window
  | 'POWER_FTP_PCT'  // 0–200 % of FTP, server uses athlete's FTP to derive watt range
  | 'RPE'            // 1–10 perceived effort, no live comparison
  | 'FREE';          // no target — warm-up, cool-down, free riding

export interface IntervalTargetHrZone {
  kind: 'HR_ZONE';
  zone: 1 | 2 | 3 | 4 | 5;
}
export interface IntervalTargetHrRange {
  kind: 'HR_RANGE';
  min: number;
  max: number;
}
export interface IntervalTargetPowerRange {
  kind: 'POWER_RANGE';
  min: number;
  max: number;
}
export interface IntervalTargetPowerFtpPct {
  kind: 'POWER_FTP_PCT';
  min: number;
  max: number;
}
export interface IntervalTargetRpe {
  kind: 'RPE';
  rpe: number;
}
export interface IntervalTargetFree {
  kind: 'FREE';
}

export type IntervalTarget =
  | IntervalTargetHrZone
  | IntervalTargetHrRange
  | IntervalTargetPowerRange
  | IntervalTargetPowerFtpPct
  | IntervalTargetRpe
  | IntervalTargetFree;

export interface WorkoutInterval {
  index: number;
  label: string;
  durationSec: number;
  target: IntervalTarget;
  /** One-line guidance shown on the mobile overlay during this interval. */
  cue?: string;
}

export interface Workout {
  id: string;
  title: string;
  description?: string | null;
  intervals: WorkoutInterval[];
  totalSec: number;
  estimatedTss?: number | null;
  status: WorkoutStatus;
  scheduledFor?: string | null; // ISO date or datetime
  startedAt?: string | null;
  completedAt?: string | null;
  activityId?: string | null;
  createdBy: 'COACH' | 'USER';
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutCreate {
  title: string;
  description?: string;
  intervals: WorkoutInterval[];
  estimatedTss?: number;
  scheduledFor?: string;
  createdBy?: 'COACH' | 'USER';
}

export interface WorkoutUpdate {
  title?: string;
  description?: string;
  intervals?: WorkoutInterval[];
  status?: WorkoutStatus;
  scheduledFor?: string | null;
  activityId?: string | null;
}
