import type { IntervalTarget, WorkoutInterval } from 'data-models';

/**
 * Live workout execution helpers — pure, no DI, so both web (preview)
 * and mobile (real-time overlay) can use them.
 */

export interface AthleteParams {
  /** Functional Threshold Power (W). Defaults to 200 if unset. */
  ftpW: number;
  /** Max HR (bpm). Defaults to 190 if unset. */
  maxHrBpm: number;
  /** Resting HR (bpm). Defaults to 60 if unset. */
  restHrBpm: number;
}

export interface ResolvedTargetRange {
  /** What we're comparing against — HR samples or power samples. */
  unit: 'bpm' | 'watts' | 'rpe' | 'free';
  /** Lower edge of the target window. */
  min?: number;
  /** Upper edge of the target window. */
  max?: number;
  /** Human label, e.g. "Z2 · 114–133 bpm". */
  label: string;
}

/**
 * Turn a target spec into concrete numbers using the athlete's profile.
 * The mobile overlay needs absolute bpm / W values to render the
 * "in zone" indicator — Z2 means nothing without a max HR.
 */
export function resolveTarget(
  target: IntervalTarget,
  athlete: AthleteParams,
): ResolvedTargetRange {
  switch (target.kind) {
    case 'HR_ZONE': {
      const { min, max } = hrZoneToBpm(target.zone, athlete.maxHrBpm);
      return {
        unit: 'bpm',
        min,
        max,
        label: `Z${target.zone} · ${min}–${max} bpm`,
      };
    }
    case 'HR_RANGE':
      return {
        unit: 'bpm',
        min: target.min,
        max: target.max,
        label: `${target.min}–${target.max} bpm`,
      };
    case 'POWER_RANGE':
      return {
        unit: 'watts',
        min: target.min,
        max: target.max,
        label: `${target.min}–${target.max} W`,
      };
    case 'POWER_FTP_PCT': {
      const min = Math.round((target.min / 100) * athlete.ftpW);
      const max = Math.round((target.max / 100) * athlete.ftpW);
      return {
        unit: 'watts',
        min,
        max,
        label: `${target.min}–${target.max}% FTP · ${min}–${max} W`,
      };
    }
    case 'RPE':
      return { unit: 'rpe', label: `RPE ${target.rpe}` };
    case 'FREE':
      return { unit: 'free', label: 'Free' };
  }
}

/** Standard 5-zone HR model: Z1 50–60%, Z2 60–70%, …, Z5 90–100%. */
function hrZoneToBpm(zone: 1 | 2 | 3 | 4 | 5, maxHr: number): { min: number; max: number } {
  const ranges: Record<number, [number, number]> = {
    1: [0.5, 0.6],
    2: [0.6, 0.7],
    3: [0.7, 0.8],
    4: [0.8, 0.9],
    5: [0.9, 1.0],
  };
  const [loFrac, hiFrac] = ranges[zone];
  return {
    min: Math.round(maxHr * loFrac),
    max: Math.round(maxHr * hiFrac),
  };
}

/**
 * Which interval contains `elapsedSec`? Returns -1 before the workout
 * starts (shouldn't happen if elapsedSec >= 0) and intervals.length
 * once the workout is done.
 */
export function currentIntervalIndex(
  elapsedSec: number,
  intervals: WorkoutInterval[],
): number {
  let acc = 0;
  for (let i = 0; i < intervals.length; i++) {
    acc += intervals[i].durationSec;
    if (elapsedSec < acc) return i;
  }
  return intervals.length;
}

/**
 * Seconds elapsed within the current interval, and seconds remaining.
 * Caller should bail early when currentIntervalIndex === intervals.length.
 */
export function intervalProgress(
  elapsedSec: number,
  intervals: WorkoutInterval[],
  currentIdx: number,
): { intervalElapsedSec: number; intervalRemainingSec: number; intervalDurationSec: number } {
  if (currentIdx < 0 || currentIdx >= intervals.length) {
    return { intervalElapsedSec: 0, intervalRemainingSec: 0, intervalDurationSec: 0 };
  }
  let start = 0;
  for (let i = 0; i < currentIdx; i++) start += intervals[i].durationSec;
  const intervalElapsedSec = Math.max(0, elapsedSec - start);
  const intervalDurationSec = intervals[currentIdx].durationSec;
  const intervalRemainingSec = Math.max(0, intervalDurationSec - intervalElapsedSec);
  return { intervalElapsedSec, intervalRemainingSec, intervalDurationSec };
}

export type TargetStatus = 'in' | 'below' | 'above' | 'unknown';

/**
 * Where is the current value relative to the target range? Includes a
 * small hysteresis band so the indicator doesn't flicker on each ±1 bpm.
 *   - "in"     value within [min, max] OR not comparable (RPE / FREE)
 *   - "below"  value below min by more than `tolerance` (push harder)
 *   - "above"  value above max by more than `tolerance` (ease off)
 *   - "unknown" missing value
 */
export function classifyValue(
  value: number | null | undefined,
  range: ResolvedTargetRange,
  tolerance = 3,
): TargetStatus {
  if (range.unit === 'rpe' || range.unit === 'free') return 'in';
  if (value == null || !Number.isFinite(value)) return 'unknown';
  if (range.min == null || range.max == null) return 'in';
  if (value < range.min - tolerance) return 'below';
  if (value > range.max + tolerance) return 'above';
  return 'in';
}
