import { computed, inject, Injectable, signal } from '@angular/core';
import {
  BleManager,
  BleReading,
  CscReading,
  HrmReading,
  PowerReading,
} from 'ble';
import { ConfigService } from 'api-client';
import { Subscription } from 'rxjs';
import {
  LiveStats,
  PauseSegment,
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
  private readonly config = inject(ConfigService);

  readonly session = signal<RecordingSession | null>(null);
  /** Most recent merged sample — used for live tile rendering. */
  readonly latest = signal<RecordingSample | null>(null);
  /** True while auto-pause is holding the clock. */
  readonly paused = signal(false);

  readonly stats = computed<LiveStats | null>(() => {
    const s = this.session();
    if (!s) return null;
    return computeStats(s.samples, this.now() - s.startedAt, s.pauseSegments);
  });

  /** Wall-clock tick (1 Hz) used so duration updates in the UI without new samples. */
  private readonly now = signal(Date.now());
  private tickHandle?: ReturnType<typeof setInterval>;
  private subscription?: Subscription;

  /** Partial sample accumulator — gets reset every push. */
  private partial: Omit<RecordingSample, 't'> = {};
  private lastFlushT = 0;
  private readonly flushIntervalMs = 1000;

  /** Auto-pause: timestamp (ms) when speed first dropped below threshold. */
  private slowSinceMs?: number;

  /**
   * GPS speed/distance fallback. When no CSC sensor has fired in this
   * session, successive GPS samples become the speed + distance source.
   * Tracks the previous fix and a session-cumulative distance.
   */
  private sessionHasCsc = false;
  private gpsPrev?: { lat: number; lng: number; t: number };
  private gpsDistanceM = 0;

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
      pauseSegments: [],
      weather: null,
    };
    this.session.set(session);
    this.latest.set(null);
    this.paused.set(false);
    this.slowSinceMs = undefined;
    this.sessionHasCsc = false;
    this.gpsPrev = undefined;
    this.gpsDistanceM = 0;
    this.partial = {};
    this.lastFlushT = 0;

    this.subscription = this.ble.readings$.subscribe((r) => this.ingest(r));
    this.tickHandle = setInterval(() => {
      this.now.set(Date.now());
      this.checkAutoPause();
    }, 1000);
    return session;
  }

  stop(): RecordingSession | null {
    const s = this.session();
    if (!s) return null;
    this.subscription?.unsubscribe();
    this.subscription = undefined;
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.tickHandle = undefined;

    // Close any in-flight pause segment so we don't ship an `end: null` to the API.
    let segments = s.pauseSegments;
    if (this.paused() && segments.length > 0 && segments[segments.length - 1].end == null) {
      const t = Date.now() - s.startedAt;
      segments = [...segments];
      segments[segments.length - 1] = { ...segments[segments.length - 1], end: t };
    }
    this.paused.set(false);

    // Flush the last partial sample so we don't lose the final reading.
    this.flush(Date.now() - s.startedAt);
    const ended: RecordingSession = {
      ...s,
      pauseSegments: segments,
      endedAt: Date.now(),
    };
    this.session.set(null);
    return ended;
  }

  /**
   * Per-second wall-clock-driven auto-pause: when latest speed sits below the
   * configured threshold for the configured delay, enter paused state. Resume
   * the moment speed picks back up. ConfigService values are read each tick
   * so live tweaks in Settings apply without a restart.
   */
  private checkAutoPause(): void {
    if (!this.config.autoPauseEnabled()) {
      if (this.paused()) this.endPause();
      this.slowSinceMs = undefined;
      return;
    }
    const speedKmh = (this.latest()?.speedMps ?? 0) * 3.6;
    const threshold = this.config.autoPauseThresholdKmh();
    const delayMs = this.config.autoPauseDelaySec() * 1000;

    if (speedKmh < threshold) {
      if (this.slowSinceMs == null) {
        this.slowSinceMs = Date.now();
      } else if (!this.paused() && Date.now() - this.slowSinceMs >= delayMs) {
        this.beginPause();
      }
    } else {
      this.slowSinceMs = undefined;
      if (this.paused()) this.endPause();
    }
  }

  private beginPause(): void {
    const s = this.session();
    if (!s) return;
    const t = Date.now() - s.startedAt;
    this.session.set({
      ...s,
      pauseSegments: [...s.pauseSegments, { start: t, end: null }],
    });
    this.paused.set(true);
  }

  private endPause(): void {
    const s = this.session();
    if (!s) return;
    const t = Date.now() - s.startedAt;
    const segments = [...s.pauseSegments];
    const last = segments[segments.length - 1];
    if (last && last.end == null) {
      segments[segments.length - 1] = { ...last, end: t };
    }
    this.session.set({ ...s, pauseSegments: segments });
    this.paused.set(false);
  }

  /** External feed for GPS samples (or any other future source). */
  pushLocation(lat: number, lng: number, altitudeM?: number): void {
    this.partial.lat = lat;
    this.partial.lng = lng;
    if (altitudeM != null) this.partial.altitudeM = altitudeM;

    // GPS-derived speed + distance. Always integrate (cheap), but only
    // promote to partial.speedMps/distanceM when no CSC sensor has ever
    // fired in this session — otherwise the wheel sensor wins.
    const now = Date.now();
    if (this.gpsPrev) {
      const dtSec = (now - this.gpsPrev.t) / 1000;
      // Skip tiny intervals (sub-300ms — noise dominates) and big gaps
      // (suspended app, lost fix — would yield bogus speed spikes).
      if (dtSec >= 0.3 && dtSec <= 30) {
        const distM = haversineM(this.gpsPrev.lat, this.gpsPrev.lng, lat, lng);
        const speed = distM / dtSec;
        // Sanity guard: GPS occasionally jumps 100+ m on a bad fix. Cap
        // at 50 m/s = 180 km/h which is way above any realistic cyclist.
        if (speed < 50) {
          this.gpsDistanceM += distM;
          if (!this.sessionHasCsc) {
            this.partial.speedMps = speed;
            this.partial.distanceM = this.gpsDistanceM;
          }
        }
      }
    }
    this.gpsPrev = { lat, lng, t: now };
  }

  /** Stamp the latest weather snapshot onto the session. */
  pushWeather(snapshot: import('data-models').WeatherSnapshot): void {
    const s = this.session();
    if (!s) return;
    this.session.set({ ...s, weather: snapshot });
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

    const bestDist = windowDistance(s.samples, bestStartMs, bestTargetMs);
    const currentDist = windowDistance(
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
    const lapStartMs = splits.length > 0 ? splits[splits.length - 1] : 0;
    const lapEndMs = this.now() - s.startedAt;
    const lapSamples = s.samples.filter((sm) => sm.t >= lapStartMs);
    return computeLapStats(lapSamples, lapStartMs, lapEndMs);
  });

  private ingest(r: BleReading): void {
    if (!this.session()) return;
    if (r.kind === 'HRM') {
      this.partial.hr = (r.data as HrmReading).bpm;
    } else if (r.kind === 'CSC') {
      const csc = r.data as CscReading;
      if (csc.cadenceRpm != null) this.partial.cadenceRpm = csc.cadenceRpm;
      if (csc.speedMps != null) {
        this.partial.speedMps = csc.speedMps;
        this.sessionHasCsc = true;
      }
      if (csc.cumulativeDistanceM != null) {
        this.partial.distanceM = csc.cumulativeDistanceM;
        this.sessionHasCsc = true;
      }
    } else if (r.kind === 'POWER') {
      const p = r.data as PowerReading;
      this.partial.watts = p.watts;
      // Power meters with crank revs double as a cadence source. Only fill
      // if a CSC sensor hasn't already provided cadence (CSC tends to be
      // more accurate when both are present).
      if (p.cadenceRpm != null && this.partial.cadenceRpm == null) {
        this.partial.cadenceRpm = p.cadenceRpm;
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

/** Total paused milliseconds in [0, nowMs]. In-flight segment uses `nowMs` as its end. */
function pausedMsTotal(segments: PauseSegment[], nowMs: number): number {
  let total = 0;
  for (const seg of segments) {
    const start = Math.max(0, Math.min(seg.start, nowMs));
    const end = Math.max(0, Math.min(seg.end ?? nowMs, nowMs));
    if (end > start) total += end - start;
  }
  return total;
}

/**
 * Stats for a lap window: same shape as computeStats but `distanceM` is
 * the *delta* across this lap (last cumulative - first cumulative), not the
 * absolute cumulative reading. Same for avg speed.
 */
function computeLapStats(
  samples: RecordingSample[],
  lapStartMs: number,
  lapEndMs: number,
): LiveStats {
  const durationSec = Math.max(0, Math.round((lapEndMs - lapStartMs) / 1000));
  let sumHr = 0;
  let countHr = 0;
  let maxHr = 0;
  let sumCadence = 0;
  let countCadence = 0;
  let maxSpeed = 0;
  let sumWatts = 0;
  let countWatts = 0;
  let maxWatts = 0;

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
    if (s.watts != null) {
      sumWatts += s.watts;
      countWatts++;
      if (s.watts > maxWatts) maxWatts = s.watts;
    }
  }

  const lapDistance = windowDistance(samples, lapStartMs, lapEndMs);

  return {
    durationSec,
    elapsedSec: durationSec,
    distanceM: lapDistance,
    avgHr: countHr > 0 ? sumHr / countHr : undefined,
    maxHr: countHr > 0 ? maxHr : undefined,
    avgCadenceRpm: countCadence > 0 ? sumCadence / countCadence : undefined,
    avgSpeedMps:
      lapDistance > 0 && durationSec > 0 ? lapDistance / durationSec : undefined,
    maxSpeedMps: maxSpeed > 0 ? maxSpeed : undefined,
    avgWatts: countWatts > 0 ? sumWatts / countWatts : undefined,
    maxWatts: countWatts > 0 ? maxWatts : undefined,
  };
}

/**
 * Distance moved during [startMs, endMs] from CSC cumulative readings,
 * with boundary extrapolation using the bracketing samples' speed so
 * the first/last fraction-of-a-second isn't lost.
 *
 *   distance = (last.cumulative − first.cumulative)
 *            + first.speed × (first.t − startMs)      // lead-in
 *            + last.speed  × (endMs − last.t)         // trail-out
 *
 * Without the extrapolation a 13s ride @ 10km/h shows ~9.2km/h because
 * the first CSC reading lands ~1s into the recording. The lead-in covers
 * that missing slice. Negligible for long rides; matters for short ones.
 */
function windowDistance(
  samples: RecordingSample[],
  startMs: number,
  endMs: number,
): number {
  let firstSample: RecordingSample | null = null;
  let lastSample: RecordingSample | null = null;
  for (const s of samples) {
    if (s.t < startMs || s.t > endMs) continue;
    if (s.distanceM != null) {
      if (firstSample == null) firstSample = s;
      lastSample = s;
    }
  }
  if (!firstSample || !lastSample || firstSample.distanceM == null || lastSample.distanceM == null) {
    return 0;
  }
  const sensorDelta = lastSample.distanceM - firstSample.distanceM;
  const leadIn =
    (firstSample.speedMps ?? 0) * Math.max(0, (firstSample.t - startMs) / 1000);
  const trailOut =
    (lastSample.speedMps ?? 0) * Math.max(0, (endMs - lastSample.t) / 1000);
  return Math.max(0, sensorDelta + leadIn + trailOut);
}

function computeStats(
  samples: RecordingSample[],
  elapsedMs: number,
  pauseSegments: PauseSegment[],
): LiveStats {
  const elapsedSec = Math.max(0, Math.round(elapsedMs / 1000));
  const movingMs = Math.max(0, elapsedMs - pausedMsTotal(pauseSegments, elapsedMs));
  const movingSec = Math.round(movingMs / 1000);

  let sumHr = 0;
  let countHr = 0;
  let maxHr = 0;
  let sumCadence = 0;
  let countCadence = 0;
  let maxSpeed = 0;
  let sumWatts = 0;
  let countWatts = 0;
  let maxWatts = 0;
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
    if (s.watts != null) {
      sumWatts += s.watts;
      countWatts++;
      if (s.watts > maxWatts) maxWatts = s.watts;
    }
  }
  const sessionDistance = windowDistance(samples, 0, elapsedMs);
  return {
    durationSec: movingSec,
    elapsedSec,
    distanceM: sessionDistance,
    avgHr: countHr > 0 ? sumHr / countHr : undefined,
    maxHr: countHr > 0 ? maxHr : undefined,
    avgCadenceRpm: countCadence > 0 ? sumCadence / countCadence : undefined,
    avgSpeedMps:
      sessionDistance > 0 && movingSec > 0
        ? sessionDistance / movingSec
        : undefined,
    maxSpeedMps: maxSpeed > 0 ? maxSpeed : undefined,
    avgWatts: countWatts > 0 ? sumWatts / countWatts : undefined,
    maxWatts: countWatts > 0 ? maxWatts : undefined,
  };
}

/**
 * Great-circle distance between two lat/lng points in meters. Used for
 * GPS-only speed fallback when no wheel sensor is paired.
 */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
