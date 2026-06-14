import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BleManager } from 'ble';
// KnownSensorStore is no longer referenced here — sensor management moved
// to feature-settings. The service is still provided globally via 'root'.
import { GpsTracker, RecordingService, UploadQueue } from 'recording';
import { WeatherService } from 'weather';
import { compassCardinal, describeWeather } from 'data-models';
import { ConfigService, type RecordTile } from 'api-client';
import { SpeedGaugeComponent } from '../speed-gauge/speed-gauge.component';

interface TileDef {
  label: string;
  color: string;
  unit: string;
}

const TILE_DEFS: Record<RecordTile, TileDef> = {
  hr: { label: 'Heart rate', color: 'text-rose-400', unit: 'bpm' },
  cadence: { label: 'Cadence', color: 'text-amber-400', unit: 'rpm' },
  speed: { label: 'Speed', color: 'text-sky-400', unit: 'km/h' },
  'speed-gauge': { label: 'Speed', color: 'text-sky-400', unit: '' },
  distance: { label: 'Distance', color: 'text-emerald-400', unit: 'km' },
  'lap-time': { label: 'Lap time', color: 'text-purple-400', unit: '' },
  'total-time': { label: 'Total time', color: 'text-slate-300', unit: '' },
  'avg-speed': { label: 'Avg speed', color: 'text-sky-300', unit: 'km/h' },
  'avg-hr': { label: 'Avg HR', color: 'text-rose-300', unit: 'bpm' },
};

/**
 * Single-screen MVP: scan → connect → live readings → record / stop.
 *
 * Designed for one-handed use on a phone propped on the handlebars. Big tiles,
 * minimum touch targets, no nested navigation.
 */
@Component({
  selector: 'lib-feature-record',
  imports: [DecimalPipe, RouterLink, SpeedGaugeComponent],
  template: `
    <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header class="px-5 pt-safe-6 pb-4 flex items-center justify-between">
        <h1 class="text-xl font-semibold">Record</h1>
        @if (!recording()) {
          <a
            routerLink="/settings"
            class="text-sm w-9 h-9 rounded-md bg-slate-800 hover:bg-slate-700 flex items-center justify-center"
            aria-label="Settings"
          >⚙</a>
        }
      </header>

      @if (errorMsg(); as msg) {
        <p class="mx-5 mb-3 text-sm text-rose-400">{{ msg }}</p>
      }

      @if (pendingUploads().length > 0) {
        <button
          (click)="retryUploads()"
          [disabled]="uploading()"
          class="mx-5 mb-3 px-3 py-2 rounded-lg bg-amber-900/40 border border-amber-700/50 text-left disabled:opacity-50"
        >
          <div class="text-xs text-amber-300">
            {{ uploading()
              ? 'Uploading…'
              : pendingUploads().length + ' ride' + (pendingUploads().length === 1 ? '' : 's') + ' pending upload' }}
          </div>
          @if (uploadError(); as e) {
            <div class="text-xs text-amber-200/80 mt-1">{{ e }} — tap to retry</div>
          }
        </button>
      }

      @if (!recording() && connected().length === 0) {
        <div class="mx-5 mb-3 rounded-lg border border-dashed border-slate-700 px-4 py-6 text-center">
          <p class="text-sm text-slate-400 mb-3">
            No sensors connected.
          </p>
          <a
            routerLink="/settings"
            fragment="sensors"
            class="inline-block px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-sm"
          >Manage sensors →</a>
        </div>
      }

      @if (recording() && weatherLatest(); as w) {
        <div class="mx-5 mb-3 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between tabular-nums">
          <div class="flex items-center gap-2 text-sm">
            <span class="text-lg">{{ weatherEmoji(w.weatherCode) }}</span>
            <span class="font-medium">
              {{ w.tempC != null ? ((w.tempC | number: '1.0-0') + '°C') : '—' }}
            </span>
            <span class="text-xs text-slate-500">{{ weatherLabel(w.weatherCode) }}</span>
          </div>
          <div class="flex items-center gap-1 text-sm">
            <span class="text-lg">💨</span>
            <span class="font-medium">
              {{ w.windSpeedKmh != null ? ((w.windSpeedKmh | number: '1.0-0') + ' km/h') : '—' }}
            </span>
            <span class="text-xs text-slate-500">{{ windCardinal(w.windDirectionDeg) }}</span>
            @if (w.windGustKmh != null && w.windSpeedKmh != null && w.windGustKmh > w.windSpeedKmh) {
              <span class="text-xs text-slate-500">· gust {{ w.windGustKmh | number: '1.0-0' }}</span>
            }
          </div>
        </div>
      }

      @if (connected().length > 0) {
        <section
          class="px-5 pb-6 grid gap-3 mt-auto"
          [class.grid-cols-2]="layout() === 'two-col'"
          [class.grid-cols-1]="layout() === 'one-col'"
        >
          @for (tile of tiles(); track tile) {
            @if (tile === 'speed-gauge') {
              <mobile-speed-gauge [speedKmh]="speedKmh() ?? 0" />
            } @else {
            <div class="rounded-xl bg-slate-900 p-4">
              <div
                class="text-[10px] uppercase tracking-wider"
                [class]="tileDef(tile).color"
              >
                {{ tileDef(tile).label }}
              </div>
              <div
                class="font-bold tabular-nums mt-1"
                [class.text-4xl]="layout() === 'two-col'"
                [class.text-6xl]="layout() === 'one-col'"
              >
                {{ tileValue(tile) }}
                @if (tileDef(tile).unit) {
                  <span class="text-sm text-slate-500 font-normal">
                    {{ tileDef(tile).unit }}
                  </span>
                }
              </div>
            </div>
            }
          }
        </section>

        @if (recording()) {
          <div class="px-5 pb-2 text-center text-sm tabular-nums">
            @if (paused()) {
              <span class="text-amber-400 font-semibold">⏸ PAUSED</span>
              <span class="text-slate-500 mx-2">·</span>
            }
            <span class="text-slate-400">
              Total {{ durationText() }}
              @if (stats(); as st) {
                <span class="text-slate-600">
                  · {{ formatDur(st.elapsedSec) }} elapsed
                </span>
              }
            </span>
          </div>

          @if (lapToast(); as toast) {
            <div
              class="mx-5 mb-3 px-3 py-2 rounded-lg text-center tabular-nums"
              [class.bg-emerald-900\/40]="toast.isNewBest"
              [class.border-emerald-600\/50]="toast.isNewBest"
              [class.bg-slate-900\/60]="!toast.isNewBest"
              [class.border-slate-700\/50]="!toast.isNewBest"
              class="border"
            >
              @if (toast.isNewBest) {
                <div class="text-sm font-semibold text-emerald-300">
                  🏆 New best lap!
                </div>
              }
              <div class="text-xs"
                [class.text-emerald-200]="toast.isNewBest"
                [class.text-slate-300]="!toast.isNewBest"
              >
                Lap {{ toast.index }}: {{ formatDur(toast.durationSec) }}
                @if (toast.deltaSec != null) {
                  ·
                  <span
                    [class.text-emerald-400]="toast.deltaSec < 0"
                    [class.text-rose-400]="toast.deltaSec > 0"
                  >
                    {{ toast.deltaSec > 0 ? '+' : '' }}{{ toast.deltaSec }}s vs best
                  </span>
                }
              </div>
            </div>
          }

          @if (currentLapStats(); as ls) {
            <div
              class="mx-5 mb-3 px-3 py-2 rounded-lg bg-slate-900/60 border border-amber-700/40 grid grid-cols-4 gap-2 text-center tabular-nums"
            >
              <div>
                <div class="text-[10px] uppercase tracking-wider text-amber-400">
                  Lap {{ currentLap() }}
                </div>
                <div class="text-sm font-semibold">{{ lapDurationText() }}</div>
                @if (lapDelta(); as d) {
                  <div
                    class="text-[10px] font-medium tabular-nums"
                    [class.text-emerald-400]="d.meters >= 0"
                    [class.text-rose-400]="d.meters < 0"
                  >
                    {{ d.meters > 0 ? '+' : '' }}{{ d.meters }} m vs L{{ d.referenceLap }}
                  </div>
                }
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-wider text-slate-500">
                  Dist
                </div>
                <div class="text-sm font-semibold">
                  {{ ls.distanceM / 1000 | number: '1.2-2' }}
                  <span class="text-xs font-normal text-slate-500">km</span>
                </div>
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-wider text-slate-500">
                  Avg HR
                </div>
                <div class="text-sm font-semibold">
                  {{ ls.avgHr != null ? (ls.avgHr | number: '1.0-0') : '—' }}
                </div>
              </div>
              <div>
                <div class="text-[10px] uppercase tracking-wider text-slate-500">
                  Avg cad
                </div>
                <div class="text-sm font-semibold">
                  {{ ls.avgCadenceRpm != null ? (ls.avgCadenceRpm | number: '1.0-0') : '—' }}
                </div>
              </div>
            </div>
          }
        }

        <div class="px-5 pb-safe-8 sticky bottom-0 bg-gradient-to-t from-slate-950 to-transparent pt-6">
          @if (!recording()) {
            <button
              (click)="startRecording()"
              [disabled]="connected().length === 0"
              class="w-full py-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-lg font-semibold disabled:opacity-50"
            >
              Start recording
            </button>
          } @else {
            <div class="flex gap-2">
              <button
                (click)="markLap()"
                class="flex-1 py-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-lg font-semibold"
              >
                Lap
              </button>
              <button
                (click)="stopRecording()"
                class="flex-1 py-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-lg font-semibold"
              >
                Stop
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class FeatureRecord {
  private readonly ble = inject(BleManager);
  private readonly recordingService = inject(RecordingService);
  private readonly uploadQueue = inject(UploadQueue);
  private readonly gps = inject(GpsTracker);
  private readonly weather = inject(WeatherService);
  private readonly config = inject(ConfigService);

  protected readonly gpsActive = this.gps.active;
  protected readonly weatherLatest = this.weather.latest;
  protected readonly paused = this.recordingService.paused;

  protected readonly tiles = this.config.recordTiles;
  protected readonly layout = this.config.recordLayout;

  protected tileDef(t: RecordTile): TileDef {
    return TILE_DEFS[t];
  }

  protected tileValue(t: RecordTile): string {
    switch (t) {
      case 'hr':
        return this.heartRate()?.toString() ?? '—';
      case 'cadence':
        return formatNumber(this.cadence() ?? 0, 0);
      case 'speed':
        return formatNumber(this.speedKmh() ?? 0, 1);
      case 'speed-gauge':
        // Rendered via <mobile-speed-gauge> — no text value path.
        return '';
      case 'distance':
        return formatNumber(this.distanceKm(), 2);
      case 'lap-time':
        return this.lapDurationText();
      case 'total-time':
        return this.durationText();
      case 'avg-speed': {
        const v = this.stats()?.avgSpeedMps;
        return v != null ? formatNumber(v * 3.6, 1) : '—';
      }
      case 'avg-hr': {
        const v = this.stats()?.avgHr;
        return v != null ? formatNumber(v, 0) : '—';
      }
    }
  }

  // The record screen only *reads* connection state — sensor management
  // (scan / connect / reconnect / forget) lives on the Settings page.
  protected readonly connected = this.ble.connected;
  protected readonly pendingUploads = this.uploadQueue.pending;
  protected readonly uploading = this.uploadQueue.uploading;
  protected readonly uploadError = this.uploadQueue.lastError;
  protected readonly errorMsg = signal<string | null>(null);

  protected readonly recording = computed(() => this.recordingService.session() != null);
  protected readonly latest = this.recordingService.latest;
  protected readonly stats = this.recordingService.stats;

  protected readonly heartRate = computed(() => this.latest()?.hr);
  protected readonly cadence = computed(() => this.latest()?.cadenceRpm);
  protected readonly speedKmh = computed(() => {
    const mps = this.latest()?.speedMps;
    return mps != null ? mps * 3.6 : undefined;
  });
  protected readonly distanceKm = computed(() => {
    const m = this.stats()?.distanceM ?? this.latest()?.distanceM ?? 0;
    return m / 1000;
  });
  protected readonly durationText = computed(() =>
    formatDuration(this.stats()?.durationSec ?? 0),
  );
  protected readonly currentLap = this.recordingService.currentLap;
  protected readonly currentLapStats = this.recordingService.currentLapStats;
  protected readonly lapDurationText = computed(() =>
    formatDuration(this.currentLapStats()?.durationSec ?? 0),
  );
  protected readonly lapDelta = this.recordingService.lapDelta;
  protected readonly lapToast = this.recordingService.lapToast;

  async startRecording(): Promise<void> {
    this.errorMsg.set(null);
    try {
      this.recordingService.start();
      // Kick off GPS in parallel — non-blocking, recording proceeds even if
      // location permission is denied (indoor / trainer rides).
      void this.gps.start();
      // Weather refreshes every 5 min using the most recent GPS sample.
      this.weather.start(() => {
        const s = this.recordingService.latest();
        if (s?.lat != null && s?.lng != null) {
          return { lat: s.lat, lng: s.lng };
        }
        return null;
      });
    } catch (err) {
      this.errorMsg.set(toMessage(err));
    }
  }

  async stopRecording(): Promise<void> {
    await this.gps.stop();
    this.weather.stop();
    // Stamp the latest weather snapshot onto the session so it goes up with the upload.
    const latestWeather = this.weatherLatest();
    if (latestWeather) this.recordingService.pushWeather(latestWeather);
    const session = this.recordingService.stop();
    if (session) {
      void this.uploadQueue.enqueue(session);
    }
  }

  /** Manual retry from the pending-uploads banner. */
  retryUploads(): void {
    void this.uploadQueue.flush();
  }

  markLap(): void {
    this.recordingService.markLap();
  }

  /** Template helper for formatting the lap toast's seconds count. */
  protected formatDur(seconds: number): string {
    return formatDuration(seconds);
  }

  protected weatherEmoji(code: number | null | undefined): string {
    return describeWeather(code).emoji;
  }

  protected weatherLabel(code: number | null | undefined): string {
    return describeWeather(code).label;
  }

  protected windCardinal(deg: number | null | undefined): string {
    return compassCardinal(deg);
  }
}

function formatNumber(value: number, fractionDigits: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
