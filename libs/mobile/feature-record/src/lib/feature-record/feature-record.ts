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
import { SpeedRingComponent } from '../speed-ring/speed-ring.component';

interface TileDef {
  label: string;
  color: string;
  unit: string;
}

const TILE_DEFS: Record<RecordTile, TileDef> = {
  hr: { label: 'Heart rate', color: 'text-on-surface-variant', unit: 'bpm' },
  cadence: { label: 'Cadence', color: 'text-on-surface-variant', unit: 'rpm' },
  speed: { label: 'Speed', color: 'text-on-surface-variant', unit: 'km/h' },
  'speed-gauge': { label: 'Speed', color: 'text-on-surface-variant', unit: '' },
  'speed-ring': { label: 'Speed', color: 'text-on-surface-variant', unit: '' },
  distance: { label: 'Distance', color: 'text-on-surface-variant', unit: 'km' },
  'lap-time': { label: 'Lap time', color: 'text-on-surface-variant', unit: '' },
  'total-time': { label: 'Total time', color: 'text-on-surface-variant', unit: '' },
  'avg-speed': { label: 'Avg speed', color: 'text-on-surface-variant', unit: 'km/h' },
  'avg-hr': { label: 'Avg HR', color: 'text-on-surface-variant', unit: 'bpm' },
};

/**
 * Single-screen MVP: scan → connect → live readings → record / stop.
 *
 * Designed for one-handed use on a phone propped on the handlebars. Big tiles,
 * minimum touch targets, no nested navigation.
 */
@Component({
  selector: 'lib-feature-record',
  imports: [DecimalPipe, RouterLink, SpeedGaugeComponent, SpeedRingComponent],
  template: `
    <div class="min-h-screen velo-carbon text-on-surface flex flex-col font-inter relative">
      <!-- VITALOGY brand bar — hamburger / italic logo / cog -->
      <header class="px-5 pt-safe-6 pb-4 flex items-center justify-between border-b border-white/5">
        @if (!recording()) {
          <button
            type="button"
            (click)="menuOpen.set(true)"
            class="w-10 h-10 rounded-full velo-glass flex items-center justify-center hover:bg-white/10"
            aria-label="Open menu"
          >
            <span class="material-symbols-outlined text-on-surface text-[20px]">menu</span>
          </button>
        } @else {
          <span class="w-10"></span>
        }
        <h1 class="font-sora italic uppercase tracking-tighter text-2xl text-velo-lime">VITALOGY</h1>
        @if (!recording()) {
          <a
            routerLink="/settings"
            class="w-10 h-10 rounded-full velo-glass flex items-center justify-center hover:bg-white/10"
            aria-label="Settings"
          >
            <span class="material-symbols-outlined text-on-surface text-[20px]">settings</span>
          </a>
        } @else {
          <span class="w-10"></span>
        }
      </header>

      <!-- Drawer overlay -->
      @if (menuOpen()) {
        <button
          type="button"
          (click)="menuOpen.set(false)"
          class="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          aria-label="Close menu"
        ></button>
        <aside
          class="fixed left-0 top-0 bottom-0 z-50 w-72 max-w-[85vw] velo-glass pt-safe-6 px-5 pb-8 flex flex-col gap-4 animate-in slide-in-from-left"
        >
          <div class="flex items-center justify-between pb-4 border-b border-white/5">
            <h2 class="font-sora italic uppercase tracking-tighter text-xl text-velo-lime">
              VITALOGY
            </h2>
            <button
              type="button"
              (click)="menuOpen.set(false)"
              class="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center"
              aria-label="Close menu"
            >
              <span class="material-symbols-outlined text-on-surface text-[20px]">close</span>
            </button>
          </div>
          <nav class="flex flex-col gap-1">
            <a
              routerLink="/record"
              (click)="menuOpen.set(false)"
              class="flex items-center gap-3 px-3 py-3 rounded-lg bg-velo-lime/10 text-velo-lime"
            >
              <span class="material-symbols-outlined">directions_bike</span>
              <span class="font-grotesk text-label-caps uppercase">Ride</span>
            </a>
            <a
              routerLink="/settings"
              (click)="menuOpen.set(false)"
              class="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-white/5 text-on-surface"
            >
              <span class="material-symbols-outlined">settings</span>
              <span class="font-grotesk text-label-caps uppercase">Settings</span>
            </a>
            <a
              routerLink="/settings"
              fragment="sensors"
              (click)="menuOpen.set(false)"
              class="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-white/5 text-on-surface"
            >
              <span class="material-symbols-outlined">bluetooth_searching</span>
              <span class="font-grotesk text-label-caps uppercase">Sensors</span>
            </a>
          </nav>
          <div class="mt-auto text-xs text-on-surface-variant font-grotesk uppercase tracking-wider">
            v0.0.0 · vitalogy
          </div>
        </aside>
      }

      @if (errorMsg(); as msg) {
        <p class="mx-5 mt-3 text-sm text-rose-300 font-grotesk">{{ msg }}</p>
      }

      @if (pendingUploads().length > 0) {
        <button
          (click)="retryUploads()"
          [disabled]="uploading()"
          class="mx-5 mt-3 px-4 py-3 rounded-xl velo-glass text-left disabled:opacity-50"
        >
          <div class="font-grotesk text-label-caps text-velo-lime uppercase">
            {{ uploading()
              ? 'Uploading…'
              : pendingUploads().length + ' ride' + (pendingUploads().length === 1 ? '' : 's') + ' pending upload' }}
          </div>
          @if (uploadError(); as e) {
            <div class="text-xs text-on-surface-variant mt-1">{{ e }} — tap to retry</div>
          }
        </button>
      }

      @if (!recording() && connected().length === 0) {
        <div class="mx-5 mt-6 rounded-xl velo-glass px-6 py-10 text-center">
          <span class="material-symbols-outlined text-on-surface-variant text-[36px]">bluetooth_searching</span>
          <p class="mt-3 font-grotesk text-label-caps text-on-surface-variant uppercase">
            No sensors connected
          </p>
          <a
            routerLink="/settings"
            fragment="sensors"
            class="inline-block mt-4 px-6 py-2.5 rounded-full bg-velo-lime text-velo-on-lime font-grotesk text-label-caps uppercase velo-shadow-lime hover:brightness-110"
          >Manage sensors</a>
        </div>
      }

      @if (recording() && weatherLatest(); as w) {
        <div class="mx-5 mt-3 px-3 py-2 rounded-xl velo-glass flex items-center justify-between font-grotesk text-mono-data tabular-nums">
          <div class="flex items-center gap-2">
            <span class="text-lg">{{ weatherEmoji(w.weatherCode) }}</span>
            <span class="text-on-surface">
              {{ w.tempC != null ? ((w.tempC | number: '1.0-0') + '°C') : '—' }}
            </span>
            <span class="text-on-surface-variant text-xs uppercase">{{ weatherLabel(w.weatherCode) }}</span>
          </div>
          <div class="flex items-center gap-1">
            <span class="text-lg">💨</span>
            <span class="text-on-surface">
              {{ w.windSpeedKmh != null ? ((w.windSpeedKmh | number: '1.0-0') + ' km/h') : '—' }}
            </span>
            <span class="text-on-surface-variant text-xs uppercase">{{ windCardinal(w.windDirectionDeg) }}</span>
            @if (w.windGustKmh != null && w.windSpeedKmh != null && w.windGustKmh > w.windSpeedKmh) {
              <span class="text-xs text-on-surface-variant">· gust {{ w.windGustKmh | number: '1.0-0' }}</span>
            }
          </div>
        </div>
      }

      @if (connected().length > 0) {
        <section
          class="px-5 pt-5 pb-6 grid gap-4 mt-auto"
          [class.grid-cols-2]="layout() === 'two-col'"
          [class.grid-cols-1]="layout() === 'one-col'"
        >
          @for (tile of tiles(); track tile) {
            @if (tile === 'speed-gauge') {
              <mobile-speed-gauge [speedKmh]="speedKmh() ?? 0" />
            } @else if (tile === 'speed-ring') {
              <mobile-speed-ring [speedKmh]="speedKmh() ?? 0" />
            } @else {
              <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">
                  {{ tileDef(tile).label }}
                </div>
                <div class="flex items-baseline gap-1.5">
                  <span
                    class="font-sora tabular-nums leading-none text-velo-lime"
                    [class.text-metric-lg]="layout() === 'two-col'"
                    [class.text-metric-xl]="layout() === 'one-col'"
                  >{{ tileValue(tile) }}</span>
                  @if (tileDef(tile).unit) {
                    <span class="font-grotesk text-mono-data text-on-surface-variant uppercase">
                      {{ tileDef(tile).unit }}
                    </span>
                  }
                </div>
              </div>
            }
          }
        </section>

        @if (recording()) {
          <div class="px-5 pb-2 text-center font-grotesk text-mono-data tabular-nums uppercase">
            @if (paused()) {
              <span class="text-velo-lime font-semibold">⏸ PAUSED</span>
              <span class="text-on-surface-variant mx-2">·</span>
            }
            <span class="text-on-surface-variant">
              Total {{ durationText() }}
              @if (stats(); as st) {
                <span class="opacity-50">
                  · {{ formatDur(st.elapsedSec) }} elapsed
                </span>
              }
            </span>
          </div>

          @if (lapToast(); as toast) {
            <div
              class="mx-5 mb-3 px-3 py-2 rounded-xl velo-glass text-center tabular-nums"
              [class.velo-shadow-lime]="toast.isNewBest"
            >
              @if (toast.isNewBest) {
                <div class="font-grotesk text-label-caps text-velo-lime uppercase">
                  🏆 New best lap!
                </div>
              }
              <div class="font-grotesk text-mono-data uppercase mt-0.5"
                [class.text-velo-lime]="toast.isNewBest"
                [class.text-on-surface]="!toast.isNewBest"
              >
                Lap {{ toast.index }}: {{ formatDur(toast.durationSec) }}
                @if (toast.deltaSec != null) {
                  ·
                  <span
                    [class.text-velo-lime]="toast.deltaSec < 0"
                    [class.text-rose-300]="toast.deltaSec > 0"
                  >
                    {{ toast.deltaSec > 0 ? '+' : '' }}{{ toast.deltaSec }}s vs best
                  </span>
                }
              </div>
            </div>
          }

          @if (currentLapStats(); as ls) {
            <div class="mx-5 mb-3 px-4 py-3 rounded-xl velo-glass grid grid-cols-4 gap-2 text-center tabular-nums">
              <div>
                <div class="font-grotesk text-label-caps text-velo-lime uppercase">
                  Lap {{ currentLap() }}
                </div>
                <div class="font-sora text-sm font-semibold mt-1">{{ lapDurationText() }}</div>
                @if (lapDelta(); as d) {
                  <div
                    class="font-grotesk text-[10px] tabular-nums uppercase"
                    [class.text-velo-lime]="d.meters >= 0"
                    [class.text-rose-300]="d.meters < 0"
                  >
                    {{ d.meters > 0 ? '+' : '' }}{{ d.meters }} m vs L{{ d.referenceLap }}
                  </div>
                }
              </div>
              <div>
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase">Dist</div>
                <div class="font-sora text-sm font-semibold mt-1">
                  {{ ls.distanceM / 1000 | number: '1.2-2' }}
                  <span class="text-xs font-normal text-on-surface-variant">km</span>
                </div>
              </div>
              <div>
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase">Avg HR</div>
                <div class="font-sora text-sm font-semibold mt-1">
                  {{ ls.avgHr != null ? (ls.avgHr | number: '1.0-0') : '—' }}
                </div>
              </div>
              <div>
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase">Avg cad</div>
                <div class="font-sora text-sm font-semibold mt-1">
                  {{ ls.avgCadenceRpm != null ? (ls.avgCadenceRpm | number: '1.0-0') : '—' }}
                </div>
              </div>
            </div>
          }
        }

        <div class="px-5 pb-safe-8 sticky bottom-0 bg-gradient-to-t from-surface-dim via-surface-dim/80 to-transparent pt-6">
          @if (!recording()) {
            <button
              (click)="startRecording()"
              [disabled]="connected().length === 0"
              class="w-full py-5 rounded-full bg-velo-lime text-velo-on-lime font-sora italic uppercase tracking-tighter text-2xl velo-shadow-lime flex items-center justify-center gap-3 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <span class="material-symbols-outlined filled text-[28px]">play_arrow</span>
              Start Ride
            </button>
          } @else {
            <div class="flex gap-3">
              <button
                (click)="markLap()"
                class="flex-1 py-4 rounded-full velo-glass text-on-surface font-grotesk text-label-caps uppercase flex items-center justify-center gap-2 hover:bg-white/10 active:scale-[0.98] transition-all"
              >
                <span class="material-symbols-outlined text-[20px]">flag</span>
                Lap
              </button>
              <button
                (click)="stopRecording()"
                class="flex-1 py-4 rounded-full bg-velo-lime text-velo-on-lime font-grotesk text-label-caps uppercase velo-shadow-lime flex items-center justify-center gap-2 hover:brightness-110 active:scale-[0.98] transition-all"
              >
                <span class="material-symbols-outlined filled text-[20px]">stop_circle</span>
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
      case 'speed-ring':
        // Rendered via dedicated components — no text value path.
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
  protected readonly menuOpen = signal(false);

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
