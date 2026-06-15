/**
 * Pure-TS training metrics derived from a power stream.
 *
 * All inputs assume time-aligned samples at a constant `hz` rate (Strava
 * streams + our own recordings are both 1Hz). Functions return `null` when
 * there isn't enough data to compute a meaningful value rather than throwing
 * or returning 0 — UI uses null to render a "—" placeholder.
 */

export interface PowerCurvePoint {
  durationSec: number;
  watts: number;
}

/**
 * Andrew Coggan's Normalized Power.
 *
 *   1. 30-second rolling average
 *   2. ^4
 *   3. mean
 *   4. ^(1/4)
 *
 * Better than mean for variable rides because the ^4 weights spikes harder
 * (mirrors the body's lactate response to high-intensity efforts).
 */
export function normalizedPower(watts: number[], hz = 1): number | null {
  if (watts.length === 0) return null;
  const window = Math.round(30 * hz);
  if (watts.length < window) return null;
  let sum = 0;
  let count = 0;
  const rollingSum = sumWindow(watts, 0, window);
  let running = rollingSum;
  // sliding window — compute mean once per output sample
  const mean = running / window;
  sum += Math.pow(mean, 4);
  count++;
  for (let i = window; i < watts.length; i++) {
    running += watts[i] - watts[i - window];
    const m = running / window;
    sum += Math.pow(m, 4);
    count++;
  }
  return Math.pow(sum / count, 0.25);
}

/**
 * Intensity Factor = NP / FTP. ~0.70 endurance, ~0.85 tempo, 1.0 = FTP-ish,
 * >1.05 is hard.
 */
export function intensityFactor(np: number | null, ftp: number): number | null {
  if (np == null || ftp <= 0) return null;
  return np / ftp;
}

/**
 * Training Stress Score. 100 = an hour exactly at FTP. Sums linearly across
 * rides for weekly load.
 *
 *   TSS = (durationSec × NP × IF) / (FTP × 3600) × 100
 */
export function tss(
  durationSec: number,
  np: number | null,
  ftp: number,
): number | null {
  if (np == null || ftp <= 0 || durationSec <= 0) return null;
  const ifv = np / ftp;
  return (durationSec * np * ifv) / (ftp * 3600) * 100;
}

/** Sum of (watts × seconds) ÷ 1000. */
export function totalKilojoules(watts: number[], hz = 1): number | null {
  if (watts.length === 0) return null;
  let sum = 0;
  for (const w of watts) sum += w;
  return sum / hz / 1000;
}

/**
 * For each duration, the BEST rolling-average power over that window in the
 * ride. Returns one point per duration that's at most the ride length —
 * shorter rides simply yield fewer points.
 */
export function powerCurve(
  watts: number[],
  durations: number[],
  hz = 1,
): PowerCurvePoint[] {
  const out: PowerCurvePoint[] = [];
  for (const d of durations) {
    const window = Math.round(d * hz);
    if (window <= 0 || window > watts.length) continue;
    const best = bestMeanMax(watts, window);
    if (best != null) out.push({ durationSec: d, watts: best });
  }
  return out;
}

/**
 * Auto-estimate FTP as 95% of the best 20-min power. Standard field-test
 * fallback used by most training apps. Returns null for rides under 20 min
 * since there's nothing to anchor on.
 */
export function autoFtp(watts: number[], hz = 1): number | null {
  const window = Math.round(20 * 60 * hz);
  if (watts.length < window) return null;
  const best = bestMeanMax(watts, window);
  if (best == null) return null;
  return best * 0.95;
}

/** Highest mean across all `window`-sized contiguous slices of `arr`. */
function bestMeanMax(arr: number[], window: number): number | null {
  if (arr.length < window) return null;
  let sum = sumWindow(arr, 0, window);
  let best = sum;
  for (let i = window; i < arr.length; i++) {
    sum += arr[i] - arr[i - window];
    if (sum > best) best = sum;
  }
  return best / window;
}

function sumWindow(arr: number[], start: number, len: number): number {
  let s = 0;
  for (let i = start; i < start + len; i++) s += arr[i];
  return s;
}

/** Canonical durations for the power curve display. */
export const POWER_CURVE_DURATIONS = [
  1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600,
] as const;

// =========================================================================
// HR-based metrics — used when there's no power meter on the bike.
// =========================================================================

export interface HrZoneBreakdown {
  belowZ1Sec: number;
  z1Sec: number;
  z2Sec: number;
  z3Sec: number;
  z4Sec: number;
  z5Sec: number;
  totalSec: number;
}

/**
 * Classic 5-zone HR model based on % of max heart rate.
 *
 *   Z1 50–60% (recovery)
 *   Z2 60–70% (endurance)
 *   Z3 70–80% (tempo)
 *   Z4 80–90% (threshold)
 *   Z5 90–100% (VO2max)
 *
 * Samples below 50% are bucketed as "belowZ1Sec".
 */
export function hrZones(
  hr: number[],
  maxHr: number,
  hz = 1,
): HrZoneBreakdown | null {
  if (hr.length === 0 || maxHr <= 0) return null;
  const dt = 1 / hz;
  const out: HrZoneBreakdown = {
    belowZ1Sec: 0,
    z1Sec: 0,
    z2Sec: 0,
    z3Sec: 0,
    z4Sec: 0,
    z5Sec: 0,
    totalSec: 0,
  };
  for (const v of hr) {
    if (!Number.isFinite(v) || v <= 0) continue;
    const pct = v / maxHr;
    if (pct < 0.5) out.belowZ1Sec += dt;
    else if (pct < 0.6) out.z1Sec += dt;
    else if (pct < 0.7) out.z2Sec += dt;
    else if (pct < 0.8) out.z3Sec += dt;
    else if (pct < 0.9) out.z4Sec += dt;
    else out.z5Sec += dt;
    out.totalSec += dt;
  }
  return out;
}

/**
 * Banister's Training Impulse — an HR-based load score analogous to TSS.
 *
 *   TRIMP = durationMin × HRr × 0.64 × e^(1.92 × HRr)   (men's coefficient)
 *
 * where HRr = (avgHr - restHr) / (maxHr - restHr) is the heart rate
 * reserve fraction. Sums linearly across rides for weekly load.
 */
export function trimp(
  durationSec: number,
  avgHr: number | null,
  maxHr: number,
  restHr: number,
): number | null {
  if (
    avgHr == null ||
    avgHr <= 0 ||
    maxHr <= restHr ||
    durationSec <= 0
  ) {
    return null;
  }
  const hrr = Math.max(0, Math.min(1, (avgHr - restHr) / (maxHr - restHr)));
  const minutes = durationSec / 60;
  return minutes * hrr * 0.64 * Math.exp(1.92 * hrr);
}

/** Simple arithmetic mean of valid HR samples. */
export function meanHr(hr: number[]): number | null {
  if (hr.length === 0) return null;
  let sum = 0;
  let n = 0;
  for (const v of hr) {
    if (Number.isFinite(v) && v > 0) {
      sum += v;
      n++;
    }
  }
  return n > 0 ? sum / n : null;
}
