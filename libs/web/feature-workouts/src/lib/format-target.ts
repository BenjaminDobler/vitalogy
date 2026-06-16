import type { IntervalTarget, WorkoutInterval } from 'data-models';

/**
 * Color per target kind / zone for the timeline bar + detail pills.
 * Tuned to match the HR-zone palette already used by hr-zones-chart so
 * a Z2 interval in the workout previews the same olive-lime as the
 * actual Z2 time-in-zone block.
 */
export function targetColor(t: IntervalTarget): string {
  switch (t.kind) {
    case 'HR_ZONE':
      return zoneColor(t.zone);
    case 'HR_RANGE':
      return '#38bdf8'; // sky-400 — calibrated HR
    case 'POWER_RANGE':
      return '#a78bfa'; // violet-400
    case 'POWER_FTP_PCT':
      return ftpPctColor((t.min + t.max) / 2);
    case 'RPE':
      return '#94a3b8'; // slate-400
    case 'FREE':
      return '#52525b'; // zinc-600 — neutral
  }
}

function zoneColor(zone: 1 | 2 | 3 | 4 | 5): string {
  switch (zone) {
    case 1: return '#3d4a1a';
    case 2: return '#5e7a26';
    case 3: return '#9ec635';
    case 4: return '#fb923c';
    case 5: return '#ef4444';
  }
}

function ftpPctColor(pct: number): string {
  if (pct < 56) return '#3d4a1a';   // active recovery
  if (pct < 76) return '#5e7a26';   // endurance
  if (pct < 91) return '#9ec635';   // tempo
  if (pct < 106) return '#fb923c';  // threshold
  return '#ef4444';                 // VO2max and above
}

/**
 * Short human label for the target — used in pills, the live mobile
 * overlay, and the detail-page interval table.
 */
export function formatTarget(t: IntervalTarget): string {
  switch (t.kind) {
    case 'HR_ZONE':
      return `Z${t.zone}`;
    case 'HR_RANGE':
      return `${t.min}–${t.max} bpm`;
    case 'POWER_RANGE':
      return `${t.min}–${t.max} W`;
    case 'POWER_FTP_PCT':
      return `${t.min}–${t.max}% FTP`;
    case 'RPE':
      return `RPE ${t.rpe}`;
    case 'FREE':
      return 'Free';
  }
}

/** "1h12" / "45m" / "2m30s" for interval and total durations. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}`;
  if (m > 0 && sec === 0) return `${m}m`;
  if (m > 0) return `${m}m${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}

export function totalSeconds(intervals: WorkoutInterval[]): number {
  return intervals.reduce((acc, i) => acc + i.durationSec, 0);
}
