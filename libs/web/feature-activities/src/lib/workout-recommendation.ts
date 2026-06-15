import type { TrainingLoadResponse } from 'data-models';

export type WorkoutTone = 'rest' | 'recover' | 'maintain' | 'building' | 'push' | 'sharpen';

export interface WorkoutRecommendation {
  type: string;
  durationMin: number;
  /** Target intensity factor (NP / FTP, or HR-equivalent). 0 for rest days. */
  targetIf: number;
  /** Estimated TSS for the prescribed workout: duration_h × IF² × 100. */
  targetLoad: number;
  reason: string;
  tone: WorkoutTone;
}

/**
 * Translate the current training-load state into today's workout target,
 * following the classic Coggan TSB ranges with light CTL-aware tweaks.
 *
 * The aim is *guidance, not prescription* — a starting point the user can
 * accept or override. Doesn't account for the athlete's calendar, recent
 * sleep, or whether they actually want to ride today.
 */
export function recommendWorkout(
  load: TrainingLoadResponse | null,
): WorkoutRecommendation | null {
  if (!load) return null;
  const { ctl, tsb } = load.current;

  // No real history yet — guide toward building a base.
  if (ctl < 5) {
    return {
      type: 'Endurance · Z2',
      durationMin: 45,
      targetIf: 0.65,
      targetLoad: estimateTss(45, 0.65),
      reason:
        'Fitness signal is still building. Keep it conversational and consistent — frequency beats intensity right now.',
      tone: 'building',
    };
  }

  if (tsb < -30) {
    return {
      type: 'REST',
      durationMin: 0,
      targetIf: 0,
      targetLoad: 0,
      reason: `Form ${tsb.toFixed(0)} is dangerously negative. Take today off — sleep, food, hydration. The fitness sticks; the fatigue is what kills the week.`,
      tone: 'rest',
    };
  }

  if (tsb < -20) {
    return {
      type: 'Recovery · Z1',
      durationMin: 30,
      targetIf: 0.55,
      targetLoad: estimateTss(30, 0.55),
      reason: `You're overreaching (TSB ${tsb.toFixed(0)}). A 30-min spinout opens the legs without adding load.`,
      tone: 'recover',
    };
  }

  if (tsb < -10) {
    const duration = ctlScaledDuration(ctl, 60, 75, 90);
    return {
      type: 'Endurance · Z2',
      durationMin: duration,
      targetIf: 0.68,
      targetLoad: estimateTss(duration, 0.68),
      reason: `Building well at TSB ${tsb.toFixed(0)}. Steady Z2 holds the load up without spiking fatigue.`,
      tone: 'maintain',
    };
  }

  if (tsb < 5) {
    const duration = ctlScaledDuration(ctl, 60, 75, 90);
    return {
      type: 'Tempo · Z3',
      durationMin: duration,
      targetIf: 0.82,
      targetLoad: estimateTss(duration, 0.82),
      reason: `Balanced load (TSB ${tsb >= 0 ? '+' : ''}${tsb.toFixed(0)}). A tempo session adds quality without big extra stress.`,
      tone: 'push',
    };
  }

  if (tsb < 15) {
    const duration = ctlScaledDuration(ctl, 60, 60, 75);
    return {
      type: 'Threshold · Z4',
      durationMin: duration,
      targetIf: 0.9,
      targetLoad: estimateTss(duration, 0.9),
      reason: `Rested (TSB +${tsb.toFixed(0)}). Cash in with a threshold session — 2×20 or 3×15 at FTP.`,
      tone: 'push',
    };
  }

  if (tsb < 25) {
    return {
      type: 'VO2max intervals',
      durationMin: 60,
      targetIf: 0.95,
      targetLoad: estimateTss(60, 0.95),
      reason: `Very rested (TSB +${tsb.toFixed(0)}). Race-day form — VO2 intervals or a hard group ride.`,
      tone: 'sharpen',
    };
  }

  // tsb >= 25 — detraining risk
  return {
    type: 'Long ride · Z2/Z3 mix',
    durationMin: 120,
    targetIf: 0.75,
    targetLoad: estimateTss(120, 0.75),
    reason: `TSB +${tsb.toFixed(0)} — you've been resting too long. Re-engage with a meaningful endurance ride.`,
    tone: 'building',
  };
}

/**
 * Pick a duration that fits the athlete's chronic load capacity.
 * Riders at higher CTL can handle (and need) longer sessions to keep
 * the trend up. Three breakpoints: <30, 30-60, 60+.
 */
function ctlScaledDuration(
  ctl: number,
  shortMin: number,
  midMin: number,
  longMin: number,
): number {
  if (ctl < 30) return shortMin;
  if (ctl < 60) return midMin;
  return longMin;
}

function estimateTss(durationMin: number, intensity: number): number {
  return Math.round((durationMin / 60) * intensity * intensity * 100);
}
