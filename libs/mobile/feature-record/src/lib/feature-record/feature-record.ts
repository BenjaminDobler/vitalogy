import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  BleManager,
  DiscoveredSensor,
  KnownSensor,
  KnownSensorStore,
} from 'ble';
import { GpsTracker, RecordingService, UploadQueue } from 'recording';
import { WeatherService } from 'weather';
import { compassCardinal, describeWeather } from 'data-models';

/**
 * Single-screen MVP: scan → connect → live readings → record / stop.
 *
 * Designed for one-handed use on a phone propped on the handlebars. Big tiles,
 * minimum touch targets, no nested navigation.
 */
@Component({
  selector: 'lib-feature-record',
  imports: [DecimalPipe, RouterLink],
  template: `
    <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header class="px-5 pt-safe-6 pb-4 flex items-center justify-between">
        <h1 class="text-xl font-semibold">Record</h1>
        <div class="flex gap-2">
          @if (!recording()) {
            <button
              (click)="scan()"
              [disabled]="scanning()"
              class="text-sm px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
            >
              {{ scanning() ? 'Scanning…' : 'Scan' }}
            </button>
            <a
              routerLink="/settings"
              class="text-sm w-9 h-9 rounded-md bg-slate-800 hover:bg-slate-700 flex items-center justify-center"
              aria-label="Settings"
            >⚙</a>
          }
        </div>
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

      @if (!recording()) {
        <section class="px-5 pb-4">
          <h2 class="text-xs uppercase tracking-wider text-slate-500 mb-2">
            Connected
          </h2>
          @if (connected().length === 0) {
            <p class="text-sm text-slate-400">
              @if (availableKnown().length > 0) {
                Tap a recent sensor below to reconnect, or <em>Scan</em> for new ones.
              } @else {
                No sensors yet. Tap <em>Scan</em> to find your TICKR + Blue SC.
              }
            </p>
          } @else {
            <ul class="space-y-1.5">
              @for (c of connected(); track c.deviceId) {
                <li class="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2">
                  <div>
                    <div class="text-sm font-medium">
                      {{ c.name ?? c.deviceId }}
                    </div>
                    <div class="text-xs text-slate-500">
                      {{ c.subscribed.join(' · ') || 'connected, not subscribed' }}
                    </div>
                  </div>
                  <button
                    (click)="disconnect(c.deviceId)"
                    class="text-xs px-2 py-1 rounded-md text-rose-400 hover:bg-slate-800"
                  >
                    Disconnect
                  </button>
                </li>
              }
            </ul>
          }
        </section>

        @if (availableKnown().length > 0) {
          <section class="px-5 pb-4">
            <h2 class="text-xs uppercase tracking-wider text-slate-500 mb-2">
              Recent
            </h2>
            <ul class="space-y-1.5">
              @for (k of availableKnown(); track k.deviceId) {
                <li class="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2">
                  <div>
                    <div class="text-sm font-medium">
                      {{ k.name ?? '(unnamed)' }}
                    </div>
                    <div class="text-xs text-slate-500">
                      {{ k.kinds.join(', ') }}
                    </div>
                  </div>
                  <div class="flex gap-1">
                    <button
                      (click)="reconnect(k)"
                      [disabled]="connecting() === k.deviceId"
                      class="text-xs px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-50"
                    >
                      {{ connecting() === k.deviceId ? '…' : 'Reconnect' }}
                    </button>
                    <button
                      (click)="forget(k.deviceId)"
                      class="text-xs px-2 py-1.5 rounded-md text-slate-500 hover:bg-slate-800"
                    >
                      Forget
                    </button>
                  </div>
                </li>
              }
            </ul>
          </section>
        }

        @if (newlyDiscovered().length > 0) {
          <section class="px-5 pb-4">
            <h2 class="text-xs uppercase tracking-wider text-slate-500 mb-2">
              Discovered
            </h2>
            <ul class="space-y-1.5">
              @for (d of newlyDiscovered(); track d.deviceId) {
                <li class="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2">
                  <div>
                    <div class="text-sm font-medium">
                      {{ d.name ?? '(unnamed)' }}
                    </div>
                    <div class="text-xs text-slate-500">
                      {{ d.kinds.join(', ') }}
                      @if (d.rssi != null) {
                        · {{ d.rssi }} dBm
                      }
                    </div>
                  </div>
                  <button
                    (click)="connect(d)"
                    [disabled]="connecting() === d.deviceId"
                    class="text-xs px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {{ connecting() === d.deviceId ? '…' : 'Connect' }}
                  </button>
                </li>
              }
            </ul>
          </section>
        }
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
        <section class="px-5 pb-6 grid grid-cols-2 gap-3 mt-auto">
          <div class="rounded-xl bg-slate-900 p-4">
            <div class="text-[10px] uppercase tracking-wider text-rose-400">
              Heart rate
            </div>
            <div class="text-4xl font-bold tabular-nums mt-1">
              {{ heartRate() ?? '—' }}
              <span class="text-sm text-slate-500 font-normal">bpm</span>
            </div>
          </div>
          <div class="rounded-xl bg-slate-900 p-4">
            <div class="text-[10px] uppercase tracking-wider text-amber-400">
              Cadence
            </div>
            <div class="text-4xl font-bold tabular-nums mt-1">
              {{ (cadence() ?? 0) | number: '1.0-0' }}
              <span class="text-sm text-slate-500 font-normal">rpm</span>
            </div>
          </div>
          <div class="rounded-xl bg-slate-900 p-4">
            <div class="text-[10px] uppercase tracking-wider text-sky-400">
              Speed
            </div>
            <div class="text-4xl font-bold tabular-nums mt-1">
              {{ (speedKmh() ?? 0) | number: '1.1-1' }}
              <span class="text-sm text-slate-500 font-normal">km/h</span>
            </div>
          </div>
          <div class="rounded-xl bg-slate-900 p-4">
            <div class="text-[10px] uppercase tracking-wider text-emerald-400">
              Distance
            </div>
            <div class="text-4xl font-bold tabular-nums mt-1">
              {{ distanceKm() | number: '1.2-2' }}
              <span class="text-sm text-slate-500 font-normal">km</span>
            </div>
          </div>
        </section>

        @if (recording()) {
          <div class="px-5 pb-2 text-center text-sm text-slate-400 tabular-nums">
            Total {{ durationText() }}
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
  private readonly knownStore = inject(KnownSensorStore);
  private readonly uploadQueue = inject(UploadQueue);
  private readonly gps = inject(GpsTracker);
  private readonly weather = inject(WeatherService);

  protected readonly gpsActive = this.gps.active;
  protected readonly weatherLatest = this.weather.latest;

  protected readonly connected = this.ble.connected;
  protected readonly scanning = this.ble.scanning;
  protected readonly known = this.knownStore.known;
  protected readonly pendingUploads = this.uploadQueue.pending;
  protected readonly uploading = this.uploadQueue.uploading;
  protected readonly uploadError = this.uploadQueue.lastError;

  protected readonly discovered = signal<DiscoveredSensor[]>([]);
  protected readonly connecting = signal<string | null>(null);
  protected readonly errorMsg = signal<string | null>(null);

  protected readonly newlyDiscovered = computed(() => {
    const connectedIds = new Set(this.connected().map((c) => c.deviceId));
    return this.discovered().filter((d) => !connectedIds.has(d.deviceId));
  });

  /** Known sensors that aren't currently connected — these are the ones we show in "Recent". */
  protected readonly availableKnown = computed(() => {
    const connectedIds = new Set(this.connected().map((c) => c.deviceId));
    return this.known().filter((k) => !connectedIds.has(k.deviceId));
  });

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

  async scan(): Promise<void> {
    this.errorMsg.set(null);
    try {
      const found = await this.ble.scan(['HRM', 'CSC'], 6000);
      this.discovered.set(found);
    } catch (err) {
      this.errorMsg.set(toMessage(err));
    }
  }

  async connect(d: DiscoveredSensor): Promise<void> {
    this.errorMsg.set(null);
    this.connecting.set(d.deviceId);
    try {
      await this.ble.connect(d.deviceId, d.name);
      const measurementKinds = d.kinds.filter(
        (k): k is 'HRM' | 'CSC' => k === 'HRM' || k === 'CSC',
      );
      for (const kind of measurementKinds) {
        await this.ble.subscribe(d.deviceId, kind);
      }
      this.discovered.update((list) =>
        list.filter((x) => x.deviceId !== d.deviceId),
      );
      // Remember this sensor for one-tap reconnect next time.
      this.knownStore.remember({
        deviceId: d.deviceId,
        name: d.name,
        kinds: measurementKinds,
      });
    } catch (err) {
      this.errorMsg.set(toMessage(err));
    } finally {
      this.connecting.set(null);
    }
  }

  /**
   * One-tap reconnect to a sensor we've connected to before. We run a brief
   * targeted scan first — iOS only allows BleClient.connect() to a deviceId
   * that's currently in its discovery cache, so the scan "wakes" the OS-level
   * registration even if the sensor was already advertising.
   */
  async reconnect(k: KnownSensor): Promise<void> {
    this.errorMsg.set(null);
    this.connecting.set(k.deviceId);
    try {
      // 4s targeted scan with the sensor's kinds. If the sensor is awake and
      // advertising we'll see it; if not, the connect below will fail and the
      // user knows to wake the sensor.
      const measurementKinds = k.kinds.filter(
        (kind): kind is 'HRM' | 'CSC' => kind === 'HRM' || kind === 'CSC',
      );
      await this.ble.scan(measurementKinds, 4000);
      await this.ble.connect(k.deviceId, k.name);
      for (const kind of measurementKinds) {
        await this.ble.subscribe(k.deviceId, kind);
      }
      this.knownStore.remember({
        deviceId: k.deviceId,
        name: k.name,
        kinds: measurementKinds,
      });
    } catch (err) {
      this.errorMsg.set(
        `Reconnect failed (wake the sensor and try again): ${toMessage(err)}`,
      );
    } finally {
      this.connecting.set(null);
    }
  }

  forget(deviceId: string): void {
    this.knownStore.forget(deviceId);
  }

  async disconnect(deviceId: string): Promise<void> {
    try {
      await this.ble.disconnect(deviceId);
    } catch (err) {
      this.errorMsg.set(toMessage(err));
    }
  }

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
