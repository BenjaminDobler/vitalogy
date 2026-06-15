/**
 * Wire shape for GET /api/activities/training-load.
 *
 * Daily load aggregates every ride that day into a single TSS-equivalent
 * score (TSS when watts data is present, Banister TRIMP from HR otherwise).
 * The CTL/ATL pair drives Banister's fitness/fatigue/form model:
 *
 *   CTL  fitness  42-day EWMA of daily load
 *   ATL  fatigue   7-day EWMA of daily load
 *   TSB  form     CTL − ATL  (positive = rested, negative = fatigued)
 */

export interface DailyLoadPoint {
  date: string; // ISO date — YYYY-MM-DD, UTC bucket
  load: number; // daily total (TSS+TRIMP summed)
  ctl: number; // fitness
  atl: number; // fatigue
  tsb: number; // form
}

export interface TrainingLoadResponse {
  daily: DailyLoadPoint[];
  current: {
    ctl: number;
    atl: number;
    tsb: number;
    // Whether ATL > CTL (fatigue building) or CTL > ATL (resting toward form).
    trend: 'building' | 'maintaining' | 'tapering';
  };
  /** Inputs the server used so the client can echo them back to the user. */
  inputs: {
    ftp: number;
    maxHr: number;
    restHr: number;
    days: number;
  };
}
