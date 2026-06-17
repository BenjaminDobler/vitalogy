import {
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BleManager } from 'ble';
// KnownSensorStore is no longer referenced here — sensor management moved
// to feature-settings. The service is still provided globally via 'root'.
import { GpsTracker, RecordingService, UploadQueue } from 'recording';
import { WeatherService } from 'weather';
import { compassCardinal, describeWeather, type Workout } from 'data-models';
import { ConfigService, type RecordTile, WorkoutsService } from 'api-client';
import { SpeedGaugeComponent } from '../speed-gauge/speed-gauge.component';
import { SpeedRingComponent } from '../speed-ring/speed-ring.component';
import { BottomNavComponent } from '../bottom-nav/bottom-nav.component';
import { WorkoutPickerComponent } from '../workout-picker/workout-picker.component';
import { WorkoutOverlayComponent } from '../workout-overlay/workout-overlay.component';
import { CountdownOverlayComponent } from '../countdown-overlay/countdown-overlay.component';

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
  imports: [
    DecimalPipe,
    NgTemplateOutlet,
    RouterLink,
    SpeedGaugeComponent,
    SpeedRingComponent,
    BottomNavComponent,
    WorkoutPickerComponent,
    WorkoutOverlayComponent,
    CountdownOverlayComponent,
  ],
  template: `
    <div class="min-h-screen velo-carbon text-on-surface flex flex-col font-inter relative" [class.pb-24]="!recording()">
      <!-- VITALOGY brand bar — hamburger / italic logo (with RIDING pill) / cog.
           Hamburger stays visible during recording so the rider can pop the
           drawer and navigate to Activities/Settings; the recording continues
           in the background (RecordingService is provided at root). -->
      <header class="px-5 pt-safe-6 pb-4 flex items-center justify-between border-b border-white/5">
        <button
          type="button"
          (click)="menuOpen.set(true)"
          class="w-10 h-10 rounded-full velo-glass flex items-center justify-center hover:bg-white/10"
          aria-label="Open menu"
        >
          <span class="material-symbols-outlined text-on-surface text-[20px]">menu</span>
        </button>
        <div class="flex items-center gap-2 min-w-0">
          @if (recording()) {
            <span
              class="font-grotesk text-label-caps uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-full bg-velo-lime/15 text-velo-lime border border-velo-lime/40 inline-flex items-center gap-1 whitespace-nowrap"
              aria-label="Ride in progress"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-velo-lime velo-pulse"></span>
              RIDING
            </span>
          }
          <h1 class="font-sora italic uppercase tracking-tighter text-2xl text-velo-lime">VITALOGY</h1>
        </div>
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
          class="velo-backdrop fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          aria-label="Close menu"
        ></button>
        <aside
          class="velo-drawer fixed left-0 top-0 bottom-0 z-50 w-72 max-w-[85vw] velo-glass pt-safe-6 px-5 pb-8 flex flex-col gap-4"
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
          class="mx-5 mt-3 px-4 py-3 rounded-xl velo-glass text-left disabled:opacity-50 flex items-center gap-3"
        >
          <span class="material-symbols-outlined text-velo-lime text-[24px]">cloud_upload</span>
          <div class="flex-1">
            <div class="font-grotesk text-label-caps text-velo-lime uppercase">
              {{ uploading()
                ? 'Uploading…'
                : pendingUploads().length + ' ride' + (pendingUploads().length === 1 ? '' : 's') + ' pending upload' }}
            </div>
            @if (uploadError(); as e) {
              <div class="text-xs text-on-surface-variant mt-1">{{ e }} — tap to retry</div>
            }
          </div>
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

      @if (!recording()) {
        <mobile-workout-picker (select)="startRecordingWith($event)" />
      }

      @if (countdownValue() != null) {
        <mobile-countdown-overlay
          [value]="countdownValue()!"
          [title]="countdownTitle()"
          (cancel)="cancelCountdown()"
        />
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
          <div class="flex items-center gap-1.5">
            <span class="material-symbols-outlined text-velo-lime text-[18px]">air</span>
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

      @if (recording()) {
        @if (workoutContext()) {
          <!-- Swipeable carousel: Combined → Workout → Sensors.
               Uses CSS scroll-snap so the gesture is native (no JS swipe
               handling). onCarouselScroll syncs the active dot. -->
          <div
            #carouselEl
            (scroll)="onCarouselScroll($event)"
            class="flex-1 min-h-0 overflow-x-auto overflow-y-hidden snap-x snap-mandatory flex velo-no-scrollbar"
          >
            <!-- Page 0 — Combined: compact workout strip + sensor tiles.
                 Each page is independently y-scrollable so a long tile
                 list on a small phone doesn't get clipped. -->
            <div class="w-full shrink-0 snap-center overflow-y-auto velo-no-scrollbar pt-3">
              <mobile-workout-overlay
                [ctx]="workoutContext()"
                [compact]="true"
              />
              <ng-container *ngTemplateOutlet="tilesTpl"></ng-container>
            </div>
            <!-- Page 1 — Workout focus: full overlay with Back/Skip. -->
            <div class="w-full shrink-0 snap-center overflow-y-auto velo-no-scrollbar flex flex-col justify-center pt-3">
              <mobile-workout-overlay
                [ctx]="workoutContext()"
                [compact]="false"
                (next)="skipInterval()"
                (previous)="previousInterval()"
              />
            </div>
            <!-- Page 2 — Sensors only: original tile-only layout. -->
            <div class="w-full shrink-0 snap-center overflow-y-auto velo-no-scrollbar pt-3">
              <ng-container *ngTemplateOutlet="tilesTpl"></ng-container>
            </div>
          </div>

          <!-- Page indicator dots. Tappable for keyboard / one-handed use. -->
          <div class="flex items-center justify-center gap-2 py-2" role="tablist" aria-label="Ride view">
            @for (p of carouselPages; track p.index) {
              <button
                type="button"
                role="tab"
                [attr.aria-selected]="carouselPage() === p.index"
                [attr.aria-label]="p.label + ' view'"
                (click)="scrollToPage(p.index)"
                class="h-2 rounded-full transition-all"
                [class.w-6]="carouselPage() === p.index"
                [class.bg-velo-lime]="carouselPage() === p.index"
                [class.w-2]="carouselPage() !== p.index"
                [class.bg-white\\/20]="carouselPage() !== p.index"
              ></button>
            }
          </div>
        } @else {
          <!-- No workout picked: just the tile grid. -->
          <ng-container *ngTemplateOutlet="tilesTpl"></ng-container>
        }

        <div class="px-5 pb-2 text-center font-grotesk text-mono-data tabular-nums uppercase flex items-center justify-center gap-2">
          @if (paused()) {
            <span class="text-velo-lime font-semibold flex items-center gap-1">
              <span class="material-symbols-outlined filled text-[18px]">pause_circle</span>
              PAUSED
            </span>
            <span class="text-on-surface-variant">·</span>
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

        <div class="px-5 pb-safe-8 sticky bottom-0 bg-gradient-to-t from-surface-dim via-surface-dim/80 to-transparent pt-6">
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
        </div>
      } @else if (connected().length > 0) {
        <ng-container *ngTemplateOutlet="tilesTpl"></ng-container>

        <div class="px-5 pb-safe-8 sticky bottom-0 bg-gradient-to-t from-surface-dim via-surface-dim/80 to-transparent pt-6">
          <button
            (click)="startRecording()"
            [disabled]="connected().length === 0"
            class="w-full py-5 rounded-full bg-velo-lime text-velo-on-lime font-sora italic uppercase tracking-tighter text-2xl velo-shadow-lime flex items-center justify-center gap-3 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <span class="material-symbols-outlined filled text-[28px]">play_arrow</span>
            Start Ride
          </button>
        </div>
      }

      <!-- Sensor tile grid — used by Combined + Sensors carousel pages,
           and also by the pre-recording preview. Single source of truth. -->
      <ng-template #tilesTpl>
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
        }
      </ng-template>

      @if (!recording()) {
        <mobile-bottom-nav />
      }
    </div>
  `,
})
export class FeatureRecord {
  private readonly ble = inject(BleManager);
  private readonly recordingService = inject(RecordingService);
  private readonly workoutsApi = inject(WorkoutsService);

  protected readonly workoutContext = this.recordingService.workoutContext;
  /** Workout the rider picked from the picker, applied at start. */
  private pendingWorkout: Workout | null = null;

  /** 3-2-1 countdown shown between picking a workout and recording.start(). */
  protected readonly countdownValue = signal<number | null>(null);
  protected readonly countdownTitle = signal<string | null>(null);
  private countdownTimer?: ReturnType<typeof setInterval>;
  private audioCtx?: AudioContext;
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

  /**
   * Active page in the ride-screen swipe carousel (workout-mode only).
   * 0 = Combined, 1 = Workout focus, 2 = Sensors only. Synced from the
   * scroll-snap container's scrollLeft so the dot indicator stays
   * accurate whether the rider swiped or tapped.
   */
  protected readonly carouselPage = signal(0);
  protected readonly carouselPages = [
    { index: 0, label: 'Combined' },
    { index: 1, label: 'Workout' },
    { index: 2, label: 'Sensors' },
  ] as const;
  private readonly carouselEl =
    viewChild<ElementRef<HTMLDivElement>>('carouselEl');

  protected onCarouselScroll(e: Event): void {
    const el = e.target as HTMLElement;
    const w = el.clientWidth;
    if (w === 0) return;
    const page = Math.round(el.scrollLeft / w);
    if (page !== this.carouselPage()) this.carouselPage.set(page);
  }

  protected scrollToPage(i: number): void {
    const el = this.carouselEl()?.nativeElement;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }

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
      // Pull the latest athlete params so HR_ZONE / POWER_FTP_PCT targets
      // resolve against the rider's real numbers. Best-effort — defaults
      // are fine offline.
      const athlete = await this.workoutsApi.refreshAthlete();
      this.recordingService.start({
        workout: this.pendingWorkout,
        athlete,
      });
      if (this.pendingWorkout) {
        // Mark IN_PROGRESS server-side so the web view shows it lit up.
        void this.workoutsApi.start(this.pendingWorkout.id).catch(() => {
          /* offline is fine; we'll still mark complete on stop */
        });
      }
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

  /**
   * Picker emitted a workout. Run a short 3-2-1 countdown so the rider
   * can get clipped in / settled before the first interval starts. The
   * recording itself only kicks off when the countdown hits zero — that
   * way the first interval gets a full clean window.
   */
  protected startRecordingWith(workout: Workout): void {
    this.pendingWorkout = workout;
    this.countdownTitle.set(workout.title);
    this.countdownValue.set(3);
    this.cueTick(false);
    this.countdownTimer = setInterval(() => {
      const cur = this.countdownValue();
      if (cur == null) return;
      if (cur > 1) {
        this.countdownValue.set(cur - 1);
        this.cueTick(false);
      } else if (cur === 1) {
        // Show GO! for one tick so the transition is unmistakable.
        this.countdownValue.set(0);
        this.cueTick(true);
      } else {
        this.clearCountdown();
        void this.startRecording();
      }
    }, 1000);
  }

  /** Overlay "Skip" tapped — jump to the next interval. */
  protected skipInterval(): void {
    this.recordingService.skipToNextInterval();
  }

  /** Overlay "Back" tapped — rewind to current-interval start or the previous one. */
  protected previousInterval(): void {
    this.recordingService.skipToPreviousInterval();
  }

  /** User cancelled the countdown — back out cleanly without starting. */
  protected cancelCountdown(): void {
    this.clearCountdown();
    this.pendingWorkout = null;
    this.countdownTitle.set(null);
  }

  private clearCountdown(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = undefined;
    this.countdownValue.set(null);
  }

  /**
   * Audio + haptic cue per tick. Triggered by the picker tap so the
   * AudioContext is allowed to start on iOS Safari (audio needs a user
   * gesture). The final GO tick uses a higher frequency + longer ring
   * so it's distinct from the lead-in ticks.
   */
  private cueTick(isGo: boolean): void {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(isGo ? 250 : 80);
      }
    } catch {
      /* permission denied / unsupported — ignore */
    }
    try {
      if (typeof window === 'undefined' || !('AudioContext' in window)) return;
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = isGo ? 1200 : 750;
      osc.type = 'sine';
      const dur = isGo ? 0.42 : 0.18;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.start(now);
      osc.stop(now + dur);
    } catch {
      /* AudioContext failed — silent fallback, visual + vibration still work */
    }
  }

  async stopRecording(): Promise<void> {
    await this.gps.stop();
    this.weather.stop();
    // Stamp the latest weather snapshot onto the session so it goes up with the upload.
    const latestWeather = this.weatherLatest();
    if (latestWeather) this.recordingService.pushWeather(latestWeather);
    this.pendingWorkout = null;
    const session = this.recordingService.stop();
    if (session) {
      // The session carries workout.id (set at start()); the upload
      // request includes workoutId and the server reconciles
      // workout.activityId + status=COMPLETED once the activity row exists.
      // No separate complete() call needed — that previously sent the
      // mobile session UUID as activityId, which couldn't link to the
      // real Activity row on the web.
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
