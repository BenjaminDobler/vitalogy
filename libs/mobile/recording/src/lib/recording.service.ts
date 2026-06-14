import { computed, inject, Injectable, signal } from '@angular/core';
import { BleManager, BleReading, CscReading, HrmReading } from 'ble';
import { Subscription } from 'rxjs';
import {
  LiveStats,
  RecordingSample,
  RecordingSession,
} from './recording-types';

/**
 * Orchestrates a single recording session:
 *  - subscribes to BleManager.readings$
 *  - merges them into a sample-per-second timeline (low-rate UI updates,
 *    high-rate raw log)
 *  - exposes live signals for the UI and a stats computed signal
 *  - on stop, returns the session object ready for local persistence / upload
 */
@Injectable({ providedIn: 'root' })
export class RecordingService {
  private readonly ble = inject(BleManager);

  readonly session = signal<RecordingSession | null>(null);
  /** Most recent merged sample — used for live tile rendering. */
  readonly latest = signal<RecordingSample | null>(null);

  readonly stats = computed<LiveStats | null>(() => {
    const s = this.session();
    if (!s) return null;
    return computeStats(s.samples, this.now() - s.startedAt);
  });

  /** Wall-clock tick (1 Hz) used so duration updates in the UI without new samples. */
  private readonly now = signal(Date.now());
  private tickHandle?: ReturnType<typeof setInterval>;
  private subscription?: Subscription;

  /** Partial sample accumulator — gets reset every push. */
  private partial: Omit<RecordingSample, 't'> = {};
  private lastFlushT = 0;
  private readonly flushIntervalMs = 1000;

  start(): RecordingSession {
    if (this.session()) {
      throw new Error('Recording already in progress');
    }
    const now = Date.now();
    const session: RecordingSession = {
      id: crypto.randomUUID(),
      startedAt: now,
      samples: [],
      lapSplits: [],
    };
    this.session.set(session);
    this.latest.set(null);
    this.partial = {};
    this.lastFlushT = 0;

    this.subscription = this.ble.readings$.subscribe((r) => this.ingest(r));
    this.tickHandle = setInterval(() => this.now.set(Date.now()), 1000);
    return session;
  }

  stop(): RecordingSession | null {
    const s = this.session();
    if (!s) return null;
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.tickHandle = undefined;
    // Flush the last partial sample so we don't lose the final reading.
    this.flush(Date.now() - s.startedAt);
    const ended: RecordingSession = { ...s, endedAt: Date.now() };
    this.session.set(null);
    return ended;
  }

  /** External feed for GPS samples (or any other future source). */
  pushLocation(lat: number, lng: number, altitudeM?: number): void {
    this.partial.lat = lat;
    this.partial.lng = lng;
    if (altitudeM != null) this.partial.altitudeM = altitudeM;
  }

  /**
   * Drop a lap boundary at the current time. The lap that was in progress
   * closes, and a new one starts. No-op if no session is in progress or the
   * caller taps Lap twice within the same flush window.
   *
   * Also emits a transient `lapToast` so the UI can announce "Lap 3: 2:18
   * (-4 sec vs best)" or "🏆 New best lap!" without polling.
   */
  markLap(): void {
    const s = this.session();
    if (!s) return;
    const t = Date.now() - s.startedAt;
    const splits = s.lapSplits;
    if (splits.length > 0 && t - splits[splits.length - 1] < 500) return;

    const lapStartMs = splits.length > 0 ? splits[splits.length - 1] : 0;
    const lapEndMs = t;
    const newLapIndex = splits.length + 1;
    const newLapDurationSec = Math.max(
      0,
      Math.round((lapEndMs - lapStartMs) / 1000),
    );
    const previousBestDur = findBestLapDurationSec(splits);
    const deltaSec =
      previousBestDur != null ? newLapDurationSec - previousBestDur : null;
    const isNewBest = previousBestDur != null && newLapDurationSec < previousBestDur;

    this.showLapToast({
      index: newLapIndex,
      durationSec: newLapDurationSec,
      deltaSec,
      isNewBest,
    });

    const nextSplits = [...splits, t];
    this.session.set({ ...s, lapSplits: nextSplits });
  }

  /**
   * Live "vs best lap" delta. Positive meters = you are ahead of where the
   * best lap was at this elapsed-into-lap time; negative = behind.
   * Returns null until at least one lap has been completed.
   */
  readonly lapDelta = computed<{
    meters: number;
    referenceLap: number;
  } | null>(() => {
    const s = this.session();
    if (!s || s.lapSplits.length === 0) return null;

    // Find fastest completed lap so far (1-based index).
    let bestIdx = 0;
    let bestDur = Infinity;
    for (let i = 0; i < s.lapSplits.length; i++) {
      const startMs = i === 0 ? 0 : s.lapSplits[i - 1];
      const endMs = s.lapSplits[i];
      const dur = endMs - startMs;
      if (dur < bestDur) {
        bestDur = dur;
        bestIdx = i;
      }
    }

    const bestStartMs = bestIdx === 0 ? 0 : s.lapSplits[bestIdx - 1];
    const bestEndMs = s.lapSplits[bestIdx];

    const currentLapStartMs = s.lapSplits[s.lapSplits.length - 1];
    const elapsedInCurrent = this.now() - s.startedAt - currentLapStartMs;

    // "Where was the best lap at this same elapsed-into-lap moment?"
    // Cap at the best lap's end — once you've ridden longer than the best lap
    // duration, the comparison is just "best lap's total distance."
    const bestTargetMs = Math.min(bestStartMs + elapsedInCurrent, bestEndMs);

    const bestDist = distanceWithin(s.samples, bestStartMs, bestTargetMs);
    const currentDist = distanceWithin(
      s.samples,
      currentLapStartMs,
      currentLapStartMs + elapsedInCurrent,
    );

    return {
      meters: Math.round(currentDist - bestDist),
      referenceLap: bestIdx + 1,
    };
  });

  /** Most recently announced lap completion. Auto-clears after 5s. */
  readonly lapToast = signal<{
    index: number;
    durationSec: number;
    deltaSec: number | null;
    isNewBest: boolean;
  } | null>(null);
  private toastClearHandle?: ReturnType<typeof setTimeout>;

  private showLapToast(payload: {
    index: number;
    durationSec: number;
    deltaSec: number | null;
    isNewBest: boolean;
  }): void {
    this.lapToast.set(payload);
    if (this.toastClearHandle) clearTimeout(this.toastClearHandle);
    this.toastClearHandle = setTimeout(() => this.lapToast.set(null), 5000);
  }

  /** 1-based current lap index — what you'd display next to "Stop". */
  readonly currentLap = computed<number>(() => {
    const s = this.session();
    if (!s) return 0;
    return s.lapSplits.length + 1;
  });

  /**
   * Live stats for just the current (in-progress) lap. `distanceM` is the
   * delta within the lap window, not the cumulative session distance.
   * Updates every second via the same wall-clock tick that drives `stats`.
   */
  readonly currentLapStats = computed<LiveStats | null>(() => {
    const s = this.session();
    if (!s) return null;
    const splits = s.lapSplits;
    const lapStartT = splits.length > 0 ? splits[splits.length - 1] : 0;
    const lapDurationMs = this.now() - s.startedAt - lapStartT;
    const lapSamples = s.samples.filter((sm) => sm.t >= lapStartT);
    return computeLapStats(lapSamples, lapDurationMs);
  });

  private ingest(r: BleReading): void {
    if (!this.session()) return;
    if (r.kind === 'HRM') {
      this.partial.hr = (r.data as HrmReading).bpm;
    } else if (r.kind === 'CSC') {
      const csc = r.data as CscReading;
      if (csc.cadenceRpm != null) this.partial.cadenceRpm = csc.cadenceRpm;
      if (csc.speedMps != null) this.partial.speedMps = csc.speedMps;
      if (csc.cumulativeDistanceM != null) {
        this.partial.distanceM = csc.cumulativeDistanceM;
      }
    }
    const startedAt = this.session()!.startedAt;
    const t = r.receivedAt - startedAt;
    if (t - this.lastFlushT >= this.flushIntervalMs) {
      this.flush(t);
    }
  }

  private flush(t: number): void {
    const s = this.session();
    if (!s) return;
    const sample: RecordingSample = { t, ...this.partial };
    s.samples.push(sample);
    this.session.set({ ...s, samples: s.samples });
    this.latest.set(sample);
    this.lastFlushT = t;
  }
}

/** Shortest lap so far, in seconds. Null if no laps closed yet. */
function findBestLapDurationSec(splits: number[]): number | null {
  if (splits.length === 0) return null;
  let bestMs = Infinity;
  for (let i = 0; i < splits.length; i++) {
    const startMs = i === 0 ? 0 : splits[i - 1];
    const dur = splits[i] - startMs;
    if (dur < bestMs) bestMs = dur;
  }
  return bestMs / 1000;
}

/** Delta of the cumulative-distance reading across samples in [startMs, endMs]. */
function distanceWithin(
  samples: RecordingSample[],
  startMs: number,
  endMs: number,
): number {
  let first: number | null = null;
  let last: number | null = null;
  for (const s of samples) {
    if (s.t < startMs || s.t > endMs) continue;
    if (s.distanceM != null) {
      if (first == null) first = s.distanceM;
      last = s.distanceM;
    }
  }
  return first != null && last != null ? last - first : 0;
}

/**
 * Stats for a lap window: same shape as computeStats but `distanceM` is
 * the *delta* across this lap (last cumulative - first cumulative), not the
 * absolute cumulative reading. Same for avg speed.
 */
function computeLapStats(samples: RecordingSample[], durationMs: number): LiveStats {
  const durationSec = Math.max(0, Math.round(durationMs / 1000));
  let sumHr = 0;
  let countHr = 0;
  let maxHr = 0;
  let sumCadence = 0;
  let countCadence = 0;
  let maxSpeed = 0;
  let firstDistance: number | null = null;
  let lastDistance: number | null = null;

  for (const s of samples) {
    if (s.hr != null) {
      sumHr += s.hr;
      countHr++;
      if (s.hr > maxHr) maxHr = s.hr;
    }
    if (s.cadenceRpm != null && s.cadenceRpm > 0) {
      sumCadence += s.cadenceRpm;
      countCadence++;
    }
    if (s.speedMps != null && s.speedMps > maxSpeed) maxSpeed = s.speedMps;
    if (s.distanceM != null) {
      if (firstDistance == null) firstDistance = s.distanceM;
      lastDistance = s.distanceM;
    }
  }

  const lapDistance =
    firstDistance != null && lastDistance != null
      ? Math.max(0, lastDistance - firstDistance)
      : 0;

  return {
    durationSec,
    distanceM: lapDistance,
    avgHr: countHr > 0 ? sumHr / countHr : undefined,
    maxHr: countHr > 0 ? maxHr : undefined,
    avgCadenceRpm: countCadence > 0 ? sumCadence / countCadence : undefined,
    avgSpeedMps:
      lapDistance > 0 && durationSec > 0 ? lapDistance / durationSec : undefined,
    maxSpeedMps: maxSpeed > 0 ? maxSpeed : undefined,
  };
}

function computeStats(samples: RecordingSample[], durationMs: number): LiveStats {
  const durationSec = Math.max(0, Math.round(durationMs / 1000));
  let sumHr = 0;
  let countHr = 0;
  let maxHr = 0;
  let sumCadence = 0;
  let countCadence = 0;
  let maxSpeed = 0;
  let lastDistance = 0;
  for (const s of samples) {
    if (s.hr != null) {
      sumHr += s.hr;
      countHr++;
      if (s.hr > maxHr) maxHr = s.hr;
    }
    if (s.cadenceRpm != null && s.cadenceRpm > 0) {
      sumCadence += s.cadenceRpm;
      countCadence++;
    }
    if (s.speedMps != null && s.speedMps > maxSpeed) {
      maxSpeed = s.speedMps;
    }
    if (s.distanceM != null) {
      lastDistance = s.distanceM;
    }
  }
  return {
    durationSec,
    distanceM: lastDistance,
    avgHr: countHr > 0 ? sumHr / countHr : undefined,
    maxHr: countHr > 0 ? maxHr : undefined,
    avgCadenceRpm: countCadence > 0 ? sumCadence / countCadence : undefined,
    avgSpeedMps:
      lastDistance > 0 && durationSec > 0
        ? lastDistance / durationSec
        : undefined,
    maxSpeedMps: maxSpeed > 0 ? maxSpeed : undefined,
  };
}
