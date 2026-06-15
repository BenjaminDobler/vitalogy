import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { RouteMapComponent, StreamChartComponent } from 'ui';
import {
  compassCardinal,
  describeWeather,
  type ActivityDetail,
  type ActivityStream,
  type StreamType,
} from 'data-models';
import { AthleteSettingsService } from '../athlete-settings.service.js';
import { PowerCurveChartComponent } from '../power-curve-chart/power-curve-chart.component.js';
import { HrZonesChartComponent } from '../hr-zones-chart/hr-zones-chart.component.js';
import {
  autoFtp,
  hrZones,
  intensityFactor,
  meanHr,
  normalizedPower,
  powerCurve,
  POWER_CURVE_DURATIONS,
  totalKilojoules,
  trimp,
  tss,
} from '../training-metrics.js';

interface ImportResult {
  streams: number;
  laps: number;
  cached: boolean;
}

interface ChartSpec {
  type: StreamType;
  label: string;
  color: string;
  unit: string;
  precision?: string;
  transform?: (n: number) => number;
}

// Render order + styling for the streams we know about.
const CHART_SPECS: ChartSpec[] = [
  { type: 'watts', label: 'Power', color: '#6366f1', unit: ' W' },
  { type: 'heartrate', label: 'Heart rate', color: '#e11d48', unit: ' bpm' },
  { type: 'cadence', label: 'Cadence', color: '#f59e0b', unit: ' rpm' },
  {
    type: 'velocity_smooth',
    label: 'Speed',
    color: '#0ea5e9',
    unit: ' km/h',
    precision: '1.1-1',
    transform: (v) => v * 3.6,
  },
  { type: 'altitude', label: 'Altitude', color: '#10b981', unit: ' m' },
];

@Component({
  selector: 'lib-activity-detail',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    RouterLink,
    StreamChartComponent,
    RouteMapComponent,
    PowerCurveChartComponent,
    HrZonesChartComponent,
  ],
  template: `
    <div class="mb-4">
      <a routerLink="/activities" class="text-sm text-on-surface-variant hover:underline">
        ← Back to activities
      </a>
    </div>

    @if (loading()) {
      <div class="rounded-lg border border-white/5 velo-glass p-10 text-center text-on-surface-variant">
        @if (importStatus(); as s) {
          <p>{{ s }}</p>
        } @else {
          <p>Loading…</p>
        }
      </div>
    } @else if (error()) {
      <p class="text-rose-300">{{ error() }}</p>
    } @else if (activity(); as a) {
      <header class="mb-6">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h1 class="font-sora text-3xl font-bold tracking-tight text-on-surface">{{ a.name }}</h1>
            <p class="text-sm text-on-surface-variant">
              {{ a.startTime | date: 'fullDate' }} · {{ a.startTime | date: 'shortTime' }}
              · {{ a.sportType }}
              @if (a.trainerActivity) {
                · <span class="text-on-surface-variant">indoor</span>
              }
            </p>
          </div>
          @if (canExportToStrava(a)) {
            <button
              type="button"
              (click)="exportToStrava()"
              [disabled]="exporting()"
              class="shrink-0 px-3 py-1.5 rounded-md bg-[#fc4c02] hover:bg-[#e44402] text-white text-xs font-grotesk uppercase tracking-wider disabled:opacity-50"
            >
              {{ exporting() ? 'Pushing…' : 'Push to Strava' }}
            </button>
          } @else if (a.stravaActivityId) {
            <a
              [href]="'https://www.strava.com/activities/' + a.stravaActivityId"
              target="_blank"
              rel="noopener"
              class="shrink-0 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-on-surface text-xs font-grotesk uppercase tracking-wider"
              title="Open on Strava"
            >
              On Strava ↗
            </a>
          }
        </div>
        @if (exportError(); as e) {
          <p class="mt-2 text-xs text-rose-300">{{ e }}</p>
        }
        @if (hasWeather()) {
          <p class="mt-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
            <span>
              {{ weatherEmoji(a.weatherCode) }}
              @if (a.tempC != null) {
                <strong>{{ a.tempC | number: '1.0-0' }}°C</strong>
              }
              <span class="text-on-surface-variant">{{ weatherLabel(a.weatherCode) }}</span>
            </span>
            @if (a.windSpeedKmh != null) {
              <span>
                💨 <strong>{{ a.windSpeedKmh | number: '1.0-0' }} km/h</strong>
                <span class="text-on-surface-variant">{{ windCardinal(a.windDirectionDeg) }}</span>
                @if (a.windGustKmh != null && a.windGustKmh > a.windSpeedKmh) {
                  <span class="text-on-surface-variant">· gust {{ a.windGustKmh | number: '1.0-0' }}</span>
                }
              </span>
            }
            @if (a.humidityPct != null) {
              <span class="text-on-surface-variant">{{ a.humidityPct | number: '1.0-0' }}% humidity</span>
            }
            @if (a.precipMm != null && a.precipMm > 0) {
              <span class="text-on-surface-variant">{{ a.precipMm | number: '1.1-1' }} mm precip</span>
            }
          </p>
        }
      </header>

      <section class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
          <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">Distance</div>
          <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">
            {{ (a.distanceM / 1000) | number: '1.2-2' }} <span class="font-grotesk text-label-caps text-on-surface-variant uppercase">km</span>
          </div>
        </div>
        <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
          <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">Moving time</div>
          <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">{{ formatDuration(a.durationSec) }}</div>
        </div>
        <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
          <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">Elevation</div>
          <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">
            @if (a.elevationGainM != null) {
              {{ a.elevationGainM | number: '1.0-0' }} <span class="font-grotesk text-label-caps text-on-surface-variant uppercase">m</span>
            } @else {
              <span class="text-on-surface-variant text-base">—</span>
            }
          </div>
        </div>
        <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
          <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">Avg speed</div>
          <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">
            @if (a.avgSpeedMps != null) {
              {{ (a.avgSpeedMps * 3.6) | number: '1.1-1' }} <span class="font-grotesk text-label-caps text-on-surface-variant uppercase">km/h</span>
            } @else {
              <span class="text-on-surface-variant text-base">—</span>
            }
          </div>
        </div>

        <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
          <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">Avg power</div>
          <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">
            @if (a.avgWatts != null) {
              {{ a.avgWatts | number: '1.0-0' }} <span class="font-grotesk text-label-caps text-on-surface-variant uppercase">W</span>
            } @else {
              <span class="text-on-surface-variant text-base">—</span>
            }
          </div>
        </div>
        <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
          <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">Weighted avg</div>
          <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">
            @if (a.weightedAvgWatts != null) {
              {{ a.weightedAvgWatts | number: '1.0-0' }} <span class="font-grotesk text-label-caps text-on-surface-variant uppercase">W</span>
            } @else {
              <span class="text-on-surface-variant text-base">—</span>
            }
          </div>
        </div>
        <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
          <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">Avg HR</div>
          <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">
            @if (a.avgHeartrate != null) {
              {{ a.avgHeartrate | number: '1.0-0' }} <span class="font-grotesk text-label-caps text-on-surface-variant uppercase">bpm</span>
            } @else {
              <span class="text-on-surface-variant text-base">—</span>
            }
          </div>
        </div>
        <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
          <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">Energy</div>
          <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">
            @if (a.kilojoules != null) {
              {{ a.kilojoules | number: '1.0-0' }} <span class="font-grotesk text-label-caps text-on-surface-variant uppercase">kJ</span>
            } @else {
              <span class="text-on-surface-variant text-base">—</span>
            }
          </div>
        </div>
      </section>

      @if (hasPowerStream() || hasHrStream()) {
        <section class="mb-8">
          <div class="flex items-baseline justify-between mb-3 flex-wrap gap-3">
            <h2 class="font-grotesk text-label-caps text-on-surface uppercase">Performance</h2>
            <div class="flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
              @if (hasPowerStream()) {
                <label class="flex items-center gap-1.5">
                  FTP
                  <input
                    type="number" min="50" max="600" step="5"
                    [ngModel]="ftp()"
                    (ngModelChange)="setFtp($event)"
                    class="bg-white/5 border border-white/10 rounded px-2 py-0.5 w-16 text-on-surface tabular-nums text-right"
                  /> W
                  @if (autoFtpEstimate(); as auto) {
                    <button type="button" (click)="setFtp(auto)" class="text-velo-lime hover:underline" title="Use 95% of best 20-min power">
                      set to {{ auto | number: '1.0-0' }}
                    </button>
                  }
                </label>
              }
              @if (hasHrStream()) {
                <label class="flex items-center gap-1.5">
                  Max HR
                  <input
                    type="number" min="100" max="250" step="1"
                    [ngModel]="maxHr()"
                    (ngModelChange)="setMaxHr($event)"
                    class="bg-white/5 border border-white/10 rounded px-2 py-0.5 w-14 text-on-surface tabular-nums text-right"
                  />
                </label>
                <label class="flex items-center gap-1.5">
                  Rest
                  <input
                    type="number" min="30" max="120" step="1"
                    [ngModel]="restHr()"
                    (ngModelChange)="setRestHr($event)"
                    class="bg-white/5 border border-white/10 rounded px-2 py-0.5 w-14 text-on-surface tabular-nums text-right"
                  />
                </label>
              }
            </div>
          </div>

          <!-- Power-based tiles — only when watts stream exists. -->
          @if (hasPowerStream()) {
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">Normalized power</div>
                <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">
                  @if (np(); as v) {
                    {{ v | number: '1.0-0' }} <span class="font-grotesk text-label-caps text-on-surface-variant uppercase">W</span>
                  } @else { <span class="text-on-surface-variant text-base">—</span> }
                </div>
              </div>
              <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">Intensity factor</div>
                <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">
                  @if (intensity(); as v) {
                    {{ v | number: '1.2-2' }}
                  } @else { <span class="text-on-surface-variant text-base">—</span> }
                </div>
              </div>
              <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">Training stress</div>
                <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">
                  @if (trainingStress(); as v) {
                    {{ v | number: '1.0-0' }} <span class="font-grotesk text-label-caps text-on-surface-variant uppercase">TSS</span>
                  } @else { <span class="text-on-surface-variant text-base">—</span> }
                </div>
              </div>
              <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">Work</div>
                <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">
                  @if (derivedKj(); as v) {
                    {{ v | number: '1.0-0' }} <span class="font-grotesk text-label-caps text-on-surface-variant uppercase">kJ</span>
                  } @else { <span class="text-on-surface-variant text-base">—</span> }
                </div>
              </div>
            </div>
            <lib-power-curve-chart [points]="powerCurvePoints()" />
          }

          <!-- HR-based tiles — only when HR stream exists. -->
          @if (hasHrStream()) {
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 mt-4">
              <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">Avg HR</div>
                <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">
                  @if (avgHrComputed(); as v) {
                    {{ v | number: '1.0-0' }} <span class="font-grotesk text-label-caps text-on-surface-variant uppercase">bpm</span>
                  } @else { <span class="text-on-surface-variant text-base">—</span> }
                </div>
              </div>
              <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">TRIMP</div>
                <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">
                  @if (trimpScore(); as v) {
                    {{ v | number: '1.0-0' }}
                  } @else { <span class="text-on-surface-variant text-base">—</span> }
                </div>
              </div>
              <div class="velo-glass rounded-xl p-6 flex flex-col items-start">
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">% of max HR</div>
                <div class="font-sora text-metric-md text-velo-lime tabular-nums leading-none">
                  @if (avgHrPercent(); as v) {
                    {{ v | number: '1.0-0' }}<span class="font-grotesk text-label-caps text-on-surface-variant uppercase">%</span>
                  } @else { <span class="text-on-surface-variant text-base">—</span> }
                </div>
              </div>
            </div>
            <lib-hr-zones-chart [breakdown]="hrZonesBreakdown()" />
          }
        </section>
      }

      @if (routeCoords(); as coords) {
        <section class="mb-8">
          <h2 class="font-grotesk text-label-caps text-on-surface uppercase mb-3">Route</h2>
          <ui-route-map [latlng]="coords" />
        </section>
      }

      @if (a.laps.length > 0) {
        <section class="mb-8">
          <h2 class="font-grotesk text-label-caps text-on-surface uppercase mb-3">Laps</h2>
          <div class="rounded-lg border border-white/5 velo-glass overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-white/5 text-on-surface-variant text-left text-xs uppercase tracking-wide">
                <tr>
                  <th class="px-3 py-2 font-medium">#</th>
                  <th class="px-3 py-2 font-medium">Distance</th>
                  <th class="px-3 py-2 font-medium">Time</th>
                  <th class="px-3 py-2 font-medium">Avg speed</th>
                  <th class="px-3 py-2 font-medium">Avg power</th>
                  <th class="px-3 py-2 font-medium">Avg HR</th>
                  <th class="px-3 py-2 font-medium">Elev gain</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (lap of a.laps; track lap.lapIndex) {
                  <tr class="tabular-nums">
                    <td class="px-3 py-2">{{ lap.lapIndex }}</td>
                    <td class="px-3 py-2">{{ (lap.distanceM / 1000) | number: '1.2-2' }} km</td>
                    <td class="px-3 py-2">{{ formatDuration(lap.durationSec) }}</td>
                    <td class="px-3 py-2">
                      @if (lap.avgSpeedMps != null) {
                        {{ (lap.avgSpeedMps * 3.6) | number: '1.1-1' }} km/h
                      } @else { <span class="text-on-surface-variant">—</span> }
                    </td>
                    <td class="px-3 py-2">
                      @if (lap.avgWatts != null) {
                        {{ lap.avgWatts | number: '1.0-0' }} W
                      } @else { <span class="text-on-surface-variant">—</span> }
                    </td>
                    <td class="px-3 py-2">
                      @if (lap.avgHeartrate != null) {
                        {{ lap.avgHeartrate | number: '1.0-0' }}
                      } @else { <span class="text-on-surface-variant">—</span> }
                    </td>
                    <td class="px-3 py-2">
                      @if (lap.elevationGainM != null) {
                        {{ lap.elevationGainM | number: '1.0-0' }} m
                      } @else { <span class="text-on-surface-variant">—</span> }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      @if (charts().length > 0) {
        <section>
          <div class="flex items-baseline justify-between mb-3">
            <h2 class="font-grotesk text-label-caps text-on-surface uppercase">Streams</h2>
            <p class="text-xs text-on-surface-variant tabular-nums">
              {{ sampleCount() | number }} samples
            </p>
          </div>
          <div class="grid gap-3">
            @for (c of charts(); track c.spec.type) {
              <ui-stream-chart
                [data]="c.data"
                [label]="c.spec.label"
                [color]="c.spec.color"
                [unit]="c.spec.unit"
                [precision]="c.spec.precision ?? '1.0-0'"
              />
            }
          </div>
        </section>
      }
    }
  `,
})
export class ActivityDetailComponent {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(AthleteSettingsService);

  // Router input binding (provideRouter is configured with withComponentInputBinding()).
  readonly id = input.required<string>();

  protected readonly ftp = this.settings.ftp;
  protected readonly maxHr = this.settings.maxHr;
  protected readonly restHr = this.settings.restHr;
  protected setFtp(v: number): void {
    if (Number.isFinite(v) && v > 0) this.settings.setFtp(v);
  }
  protected setMaxHr(v: number): void {
    if (Number.isFinite(v) && v > 0) this.settings.setMaxHr(v);
  }
  protected setRestHr(v: number): void {
    if (Number.isFinite(v) && v > 0) this.settings.setRestHr(v);
  }

  protected readonly activity = signal<ActivityDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly importStatus = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly exporting = signal(false);
  protected readonly exportError = signal<string | null>(null);

  /**
   * STRAVA-source activities can't be re-exported (would duplicate),
   * and already-exported activities show the "On Strava" link instead.
   */
  protected canExportToStrava(a: ActivityDetail): boolean {
    return a.source !== 'STRAVA' && !a.stravaActivityId;
  }

  /** Coordinates for the route map, or null if this is an indoor / no-GPS ride. */
  protected readonly routeCoords = computed(() => {
    const streams = this.activity()?.streams ?? [];
    const latlng = streams.find((s) => s.type === 'latlng');
    if (!latlng) return null;
    // The latlng stream is time-aligned with the rest, so entries from
    // before GPS got a fix are stored as `null`. Filter them out — Leaflet
    // chokes on null/NaN coordinates and silently fails to draw the line.
    const raw = latlng.data as Array<[number, number] | null>;
    if (!Array.isArray(raw)) return null;
    const filtered = raw.filter(
      (p): p is [number, number] =>
        Array.isArray(p) &&
        p.length === 2 &&
        typeof p[0] === 'number' &&
        typeof p[1] === 'number' &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]),
    );
    return filtered.length > 0 ? filtered : null;
  });

  protected readonly sampleCount = computed(() => {
    const first = this.activity()?.streams[0];
    return Array.isArray(first?.data) ? first!.data.length : 0;
  });

  /** Raw watts stream as a number[] (or empty if absent / non-numeric). */
  private readonly wattsStream = computed<number[]>(() => {
    const streams = this.activity()?.streams ?? [];
    const w = streams.find((s) => s.type === 'watts');
    if (!w || !Array.isArray(w.data) || typeof w.data[0] !== 'number') return [];
    return w.data as number[];
  });

  protected readonly hasPowerStream = computed(() => this.wattsStream().length > 0);

  protected readonly np = computed(() => normalizedPower(this.wattsStream()));
  protected readonly autoFtpEstimate = computed(() => {
    const a = autoFtp(this.wattsStream());
    return a != null ? Math.round(a) : null;
  });
  protected readonly intensity = computed(() =>
    intensityFactor(this.np(), this.ftp()),
  );
  protected readonly trainingStress = computed(() => {
    const a = this.activity();
    if (!a) return null;
    return tss(a.durationSec, this.np(), this.ftp());
  });
  protected readonly derivedKj = computed(() => totalKilojoules(this.wattsStream()));
  protected readonly powerCurvePoints = computed(() =>
    powerCurve(this.wattsStream(), [...POWER_CURVE_DURATIONS]),
  );

  /** Raw HR stream as number[] (or empty if absent / non-numeric). */
  private readonly hrStream = computed<number[]>(() => {
    const streams = this.activity()?.streams ?? [];
    const w = streams.find((s) => s.type === 'heartrate');
    if (!w || !Array.isArray(w.data) || typeof w.data[0] !== 'number') return [];
    return w.data as number[];
  });
  protected readonly hasHrStream = computed(() => this.hrStream().length > 0);
  protected readonly avgHrComputed = computed(() => meanHr(this.hrStream()));
  protected readonly avgHrPercent = computed(() => {
    const hr = this.avgHrComputed();
    const max = this.maxHr();
    return hr != null && max > 0 ? (hr / max) * 100 : null;
  });
  protected readonly trimpScore = computed(() => {
    const a = this.activity();
    if (!a) return null;
    const hr = this.avgHrComputed();
    return trimp(a.durationSec, hr, this.maxHr(), this.restHr());
  });
  protected readonly hrZonesBreakdown = computed(() =>
    hrZones(this.hrStream(), this.maxHr()),
  );

  protected readonly hasWeather = computed(() => {
    const a = this.activity();
    if (!a) return false;
    return (
      a.tempC != null ||
      a.windSpeedKmh != null ||
      a.weatherCode != null ||
      a.humidityPct != null
    );
  });

  protected weatherEmoji(code: number | null | undefined): string {
    return describeWeather(code).emoji;
  }

  protected weatherLabel(code: number | null | undefined): string {
    return describeWeather(code).label;
  }

  protected windCardinal(deg: number | null | undefined): string {
    return compassCardinal(deg);
  }

  /**
   * Numeric streams paired with their styling spec, in render order.
   * latlng (tuple) is filtered out because it's not a 1D series.
   */
  protected readonly charts = computed(() => {
    const streams = this.activity()?.streams ?? [];
    const byType = new Map<string, ActivityStream>(
      streams.map((s) => [s.type, s]),
    );
    return CHART_SPECS.flatMap((spec) => {
      const s = byType.get(spec.type);
      if (!s) return [];
      const data = s.data as number[];
      if (!Array.isArray(data) || data.length === 0 || typeof data[0] !== 'number') {
        return [];
      }
      const transformed = spec.transform ? data.map(spec.transform) : data;
      return [{ spec, data: transformed }];
    });
  });

  constructor() {
    // Re-fetch whenever the route id changes (Angular re-uses the component
    // when navigating between sibling :id routes).
    effect(() => this.load(this.id()));
  }

  private load(id: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.importStatus.set('Importing from Strava (cached after first load)…');

    // Step 1: trigger detail import (no-op server-side if already cached).
    this.http
      .post<ImportResult>(`/api/strava/import/${id}`, {})
      .subscribe({
        next: (r) => {
          this.importStatus.set(
            r.cached
              ? null
              : `Imported ${r.streams} streams, ${r.laps} laps. Loading…`,
          );
          // Step 2: read the activity (with streams + laps) from our API.
          this.http.get<ActivityDetail>(`/api/activities/${id}`).subscribe({
            next: (a) => {
              this.activity.set(a);
              this.loading.set(false);
              this.importStatus.set(null);
            },
            error: (err) => this.fail(err),
          });
        },
        error: (err) => this.fail(err),
      });
  }

  private fail(err: { error?: { message?: string }; message?: string }): void {
    this.error.set(err.error?.message ?? err.message ?? 'Request failed');
    this.loading.set(false);
    this.importStatus.set(null);
  }

  protected exportToStrava(): void {
    const a = this.activity();
    if (!a || !this.canExportToStrava(a)) return;
    this.exporting.set(true);
    this.exportError.set(null);
    this.http
      .post<{ stravaActivityId: string; stravaUrl: string; cached: boolean }>(
        `/api/strava/export/${a.id}`,
        {},
      )
      .subscribe({
        next: (r) => {
          this.exporting.set(false);
          this.activity.update((cur) =>
            cur
              ? {
                  ...cur,
                  stravaActivityId: r.stravaActivityId,
                  stravaExportedAt: new Date().toISOString(),
                }
              : cur,
          );
        },
        error: (err) => {
          this.exporting.set(false);
          this.exportError.set(
            err.error?.message ?? err.message ?? 'Export failed',
          );
        },
      });
  }

  protected formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
