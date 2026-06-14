import { inject, Injectable, signal } from '@angular/core';
import { BleManager, type BleReading, type CscReading, type HrmReading } from 'ble';
import { ApiClient } from 'api-client';
import type {
  Activity,
  ActivityDetail,
  ActivityStream,
} from 'data-models';
import { RecordingService } from 'recording';
import { WeatherService } from 'weather';

/**
 * Replays a previously-recorded activity into the live recording pipeline,
 * so the record UI renders as if a real ride is happening.
 *
 * Pipeline:
 *  - loadList() fetches GET /api/activities for the picker dropdown
 *  - selectActivity(id) fetches the detail (streams + laps + weather)
 *  - start() walks the time/HR/cadence/speed/distance/latlng streams in
 *    lockstep, emitting one BleReading per second of activity time scaled
 *    by `speedMultiplier`. So at 4× speed, one second of wall clock = 4s
 *    of activity time.
 *  - stop() halts playback
 */
@Injectable({ providedIn: 'root' })
export class ReplayDriver {
  private readonly api = inject(ApiClient);
  private readonly ble = inject(BleManager);
  private readonly recording = inject(RecordingService);
  private readonly weather = inject(WeatherService);

  readonly activities = signal<Activity[]>([]);
  readonly selected = signal<ActivityDetail | null>(null);
  readonly running = signal(false);
  readonly speedMultiplier = signal<1 | 2 | 4 | 8>(1);
  readonly lastError = signal<string | null>(null);
  /** Playback cursor as a fraction 0..1 of the activity's duration. */
  readonly progress = signal(0);

  private tickHandle?: ReturnType<typeof setInterval>;
  /** Activity time (sec) advanced so far during the current replay. */
  private playheadSec = 0;
  /** Decoded streams indexed by type for O(1) lookup at each tick. */
  private streamsByType = new Map<string, ActivityStream>();
  /** Time-stream values in seconds. */
  private timeAxis: number[] = [];

  async loadList(): Promise<void> {
    this.lastError.set(null);
    try {
      const list = await this.api.get<Activity[]>('/api/activities');
      this.activities.set(list);
    } catch (err) {
      this.lastError.set(toMessage(err));
    }
  }

  async selectActivity(id: string): Promise<void> {
    this.lastError.set(null);
    try {
      const detail = await this.api.get<ActivityDetail>(`/api/activities/${id}`);
      this.selected.set(detail);
      this.streamsByType = new Map(detail.streams.map((s) => [s.type, s]));
      const timeStream = this.streamsByType.get('time');
      this.timeAxis = Array.isArray(timeStream?.data)
        ? (timeStream!.data as number[])
        : [];
    } catch (err) {
      this.lastError.set(toMessage(err));
    }
  }

  start(): void {
    const detail = this.selected();
    if (!detail || this.running()) return;
    this.running.set(true);
    this.playheadSec = 0;
    this.progress.set(0);

    // Fake the connected sensors so the UI shows them.
    this.ble.connected.set([
      { deviceId: 'replay-hrm', name: `Replay · ${detail.name}`, subscribed: ['HRM'] },
      { deviceId: 'replay-csc', name: `Replay · ${detail.name}`, subscribed: ['CSC'] },
    ]);

    // Set weather snapshot from the activity (if present).
    if (detail.weatherCode != null || detail.tempC != null) {
      this.weather.latest.set({
        tempC: detail.tempC ?? null,
        apparentTempC: detail.apparentTempC ?? null,
        humidityPct: detail.humidityPct ?? null,
        windSpeedKmh: detail.windSpeedKmh ?? null,
        windDirectionDeg: detail.windDirectionDeg ?? null,
        windGustKmh: detail.windGustKmh ?? null,
        precipMm: detail.precipMm ?? null,
        weatherCode: detail.weatherCode ?? null,
        source: 'sim:replay',
        observedAt: detail.weatherObservedAt ?? null,
      });
    }

    // Tick the real wall clock at 1Hz; advance activity time by `speedMultiplier`.
    this.tickHandle = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.tickHandle = undefined;
    this.ble.connected.set([]);
    this.running.set(false);
  }

  /** Set playhead to a given fraction (0..1) of the activity's duration. */
  scrubTo(fraction: number): void {
    const detail = this.selected();
    if (!detail) return;
    this.playheadSec = Math.max(0, Math.min(1, fraction)) * detail.durationSec;
    this.progress.set(fraction);
  }

  private tick(): void {
    const detail = this.selected();
    if (!detail) return;
    this.playheadSec += this.speedMultiplier();
    this.progress.set(Math.min(1, this.playheadSec / detail.durationSec));

    if (this.playheadSec >= detail.durationSec) {
      this.stop();
      return;
    }

    // Find the sample index for the current playhead in the time stream.
    const idx = findSampleIndex(this.timeAxis, this.playheadSec);
    if (idx < 0) return;
    const now = Date.now();

    const hr = numAt(this.streamsByType.get('heartrate'), idx);
    if (hr != null) {
      this.ble.readings$.next({
        kind: 'HRM',
        deviceId: 'replay-hrm',
        receivedAt: now,
        data: { bpm: Math.round(hr), rrMs: [] } as HrmReading,
      } as BleReading);
    }

    const cadence = numAt(this.streamsByType.get('cadence'), idx);
    const speed = numAt(this.streamsByType.get('velocity_smooth'), idx);
    const distance = numAt(this.streamsByType.get('distance'), idx);
    if (cadence != null || speed != null || distance != null) {
      this.ble.readings$.next({
        kind: 'CSC',
        deviceId: 'replay-csc',
        receivedAt: now,
        data: {
          cadenceRpm: cadence ?? undefined,
          speedMps: speed ?? undefined,
          cumulativeDistanceM: distance ?? undefined,
        } as CscReading,
      } as BleReading);
    }

    const latlngStream = this.streamsByType.get('latlng');
    if (latlngStream && Array.isArray(latlngStream.data)) {
      const pt = (latlngStream.data as Array<[number, number] | null>)[idx];
      if (
        Array.isArray(pt) &&
        typeof pt[0] === 'number' &&
        typeof pt[1] === 'number'
      ) {
        const altitude = numAt(this.streamsByType.get('altitude'), idx);
        this.recording.pushLocation(pt[0], pt[1], altitude ?? undefined);
      }
    }
  }
}

/** Binary search the time stream for the index whose t ≤ target < t+1. */
function findSampleIndex(timeAxis: number[], targetSec: number): number {
  if (timeAxis.length === 0) return -1;
  let lo = 0;
  let hi = timeAxis.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (timeAxis[mid] <= targetSec) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function numAt(stream: ActivityStream | undefined, idx: number): number | null {
  if (!stream || !Array.isArray(stream.data)) return null;
  const v = (stream.data as Array<number | null>)[idx];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
