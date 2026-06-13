import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { RouteMapComponent, StreamChartComponent } from 'ui';
import type { ActivityDetail, ActivityStream, StreamType } from 'data-models';

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
    RouterLink,
    StreamChartComponent,
    RouteMapComponent,
  ],
  template: `
    <div class="mb-4">
      <a routerLink="/activities" class="text-sm text-slate-500 hover:underline">
        ← Back to activities
      </a>
    </div>

    @if (loading()) {
      <div class="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500">
        @if (importStatus(); as s) {
          <p>{{ s }}</p>
        } @else {
          <p>Loading…</p>
        }
      </div>
    } @else if (error()) {
      <p class="text-rose-600">{{ error() }}</p>
    } @else if (activity(); as a) {
      <header class="mb-6">
        <h1 class="text-2xl font-semibold">{{ a.name }}</h1>
        <p class="text-sm text-slate-500">
          {{ a.startTime | date: 'fullDate' }} · {{ a.startTime | date: 'shortTime' }}
          · {{ a.sportType }}
          @if (a.trainerActivity) {
            · <span class="text-slate-400">indoor</span>
          }
        </p>
      </header>

      <section class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <div class="text-xs uppercase tracking-wide text-slate-500">Distance</div>
          <div class="text-xl font-semibold tabular-nums">
            {{ (a.distanceM / 1000) | number: '1.2-2' }} <span class="text-sm font-normal text-slate-500">km</span>
          </div>
        </div>
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <div class="text-xs uppercase tracking-wide text-slate-500">Moving time</div>
          <div class="text-xl font-semibold tabular-nums">{{ formatDuration(a.durationSec) }}</div>
        </div>
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <div class="text-xs uppercase tracking-wide text-slate-500">Elevation</div>
          <div class="text-xl font-semibold tabular-nums">
            @if (a.elevationGainM != null) {
              {{ a.elevationGainM | number: '1.0-0' }} <span class="text-sm font-normal text-slate-500">m</span>
            } @else {
              <span class="text-slate-400 text-base">—</span>
            }
          </div>
        </div>
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <div class="text-xs uppercase tracking-wide text-slate-500">Avg speed</div>
          <div class="text-xl font-semibold tabular-nums">
            @if (a.avgSpeedMps != null) {
              {{ (a.avgSpeedMps * 3.6) | number: '1.1-1' }} <span class="text-sm font-normal text-slate-500">km/h</span>
            } @else {
              <span class="text-slate-400 text-base">—</span>
            }
          </div>
        </div>

        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <div class="text-xs uppercase tracking-wide text-slate-500">Avg power</div>
          <div class="text-xl font-semibold tabular-nums">
            @if (a.avgWatts != null) {
              {{ a.avgWatts | number: '1.0-0' }} <span class="text-sm font-normal text-slate-500">W</span>
            } @else {
              <span class="text-slate-400 text-base">—</span>
            }
          </div>
        </div>
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <div class="text-xs uppercase tracking-wide text-slate-500">Weighted avg</div>
          <div class="text-xl font-semibold tabular-nums">
            @if (a.weightedAvgWatts != null) {
              {{ a.weightedAvgWatts | number: '1.0-0' }} <span class="text-sm font-normal text-slate-500">W</span>
            } @else {
              <span class="text-slate-400 text-base">—</span>
            }
          </div>
        </div>
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <div class="text-xs uppercase tracking-wide text-slate-500">Avg HR</div>
          <div class="text-xl font-semibold tabular-nums">
            @if (a.avgHeartrate != null) {
              {{ a.avgHeartrate | number: '1.0-0' }} <span class="text-sm font-normal text-slate-500">bpm</span>
            } @else {
              <span class="text-slate-400 text-base">—</span>
            }
          </div>
        </div>
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <div class="text-xs uppercase tracking-wide text-slate-500">Energy</div>
          <div class="text-xl font-semibold tabular-nums">
            @if (a.kilojoules != null) {
              {{ a.kilojoules | number: '1.0-0' }} <span class="text-sm font-normal text-slate-500">kJ</span>
            } @else {
              <span class="text-slate-400 text-base">—</span>
            }
          </div>
        </div>
      </section>

      @if (routeCoords(); as coords) {
        <section class="mb-8">
          <h2 class="text-lg font-semibold mb-3">Route</h2>
          <ui-route-map [latlng]="coords" />
        </section>
      }

      @if (a.laps.length > 0) {
        <section class="mb-8">
          <h2 class="text-lg font-semibold mb-3">Laps</h2>
          <div class="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
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
                      } @else { <span class="text-slate-400">—</span> }
                    </td>
                    <td class="px-3 py-2">
                      @if (lap.avgWatts != null) {
                        {{ lap.avgWatts | number: '1.0-0' }} W
                      } @else { <span class="text-slate-400">—</span> }
                    </td>
                    <td class="px-3 py-2">
                      @if (lap.avgHeartrate != null) {
                        {{ lap.avgHeartrate | number: '1.0-0' }}
                      } @else { <span class="text-slate-400">—</span> }
                    </td>
                    <td class="px-3 py-2">
                      @if (lap.elevationGainM != null) {
                        {{ lap.elevationGainM | number: '1.0-0' }} m
                      } @else { <span class="text-slate-400">—</span> }
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
            <h2 class="text-lg font-semibold">Streams</h2>
            <p class="text-xs text-slate-500 tabular-nums">
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

  // Router input binding (provideRouter is configured with withComponentInputBinding()).
  readonly id = input.required<string>();

  protected readonly activity = signal<ActivityDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly importStatus = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Coordinates for the route map, or null if this is an indoor / no-GPS ride. */
  protected readonly routeCoords = computed(() => {
    const streams = this.activity()?.streams ?? [];
    const latlng = streams.find((s) => s.type === 'latlng');
    if (!latlng) return null;
    const data = latlng.data as [number, number][];
    if (!Array.isArray(data) || data.length === 0) return null;
    return data;
  });

  protected readonly sampleCount = computed(() => {
    const first = this.activity()?.streams[0];
    return Array.isArray(first?.data) ? first!.data.length : 0;
  });

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
