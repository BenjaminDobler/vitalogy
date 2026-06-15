import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { Activity, AchievementsResponse } from 'data-models';

interface PrCard {
  key: string;
  icon: string;
  label: string;
  value: string;
  unit: string;
  activityId: string;
  activityName: string;
  date: string;
}

@Component({
  selector: 'lib-feature-activities',
  imports: [DatePipe, DecimalPipe, RouterLink],
  template: `
    <div class="flex items-baseline justify-between mb-6">
      <h1 class="font-sora italic uppercase tracking-tighter text-3xl text-velo-lime">
        Activities
      </h1>
      <button
        (click)="reload()"
        class="font-grotesk text-label-caps uppercase px-4 py-2 rounded-full velo-glass text-on-surface hover:bg-white/10"
      >
        Refresh
      </button>
    </div>

    @if (prCards().length > 0) {
      <section class="mb-8">
        <h2 class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">
          Lifetime bests
        </h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          @for (pr of prCards(); track pr.key) {
            <a
              [routerLink]="['/activities', pr.activityId]"
              class="velo-glass rounded-xl p-4 flex flex-col gap-1 hover:bg-white/10 transition-colors group"
            >
              <div class="flex items-center gap-1.5 text-velo-lime">
                <span class="material-symbols-outlined text-[20px]">{{ pr.icon }}</span>
                <span class="font-grotesk text-label-caps uppercase text-[10px] text-on-surface-variant tracking-wider">
                  {{ pr.label }}
                </span>
              </div>
              <div class="font-sora text-2xl text-velo-lime tabular-nums leading-none">
                {{ pr.value }}<span class="font-grotesk text-label-caps text-on-surface-variant uppercase text-[10px] ml-1">{{ pr.unit }}</span>
              </div>
              <div class="font-grotesk text-[10px] text-on-surface-variant uppercase tracking-wider truncate" [title]="pr.activityName">
                {{ pr.activityName }}
              </div>
              <div class="text-[10px] text-on-surface-variant">{{ pr.date }}</div>
            </a>
          }
        </div>
      </section>
    }

    @if (loading()) {
      <p class="font-grotesk text-label-caps uppercase text-on-surface-variant">Loading…</p>
    } @else if (error()) {
      <p class="text-rose-300">{{ error() }}</p>
    } @else if (activities().length === 0) {
      <div class="velo-glass rounded-xl p-10 text-center text-on-surface-variant">
        <p>No activities yet.</p>
        <p class="text-sm mt-2">Head over to <a routerLink="/import" class="text-velo-lime underline">Import</a> to pull from Strava.</p>
      </div>
    } @else {
      <ul class="space-y-2">
        @for (a of activities(); track a.id) {
          <li>
            <a
              [routerLink]="['/activities', a.id]"
              class="velo-glass block px-5 py-4 rounded-xl flex items-baseline justify-between gap-4 hover:bg-white/10 transition-colors"
            >
              <div>
                <div class="font-sora text-lg font-bold text-on-surface">{{ a.name }}</div>
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mt-1">
                  {{ a.startTime | date: 'medium' }} · {{ a.sportType }}
                </div>
              </div>
              <div class="font-sora text-velo-lime tabular-nums text-right">
                <div class="text-xl font-bold">
                  {{ (a.distanceM / 1000) | number: '1.1-1' }}
                  <span class="font-grotesk text-label-caps text-on-surface-variant uppercase">km</span>
                </div>
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase">
                  {{ a.durationSec / 60 | number: '1.0-0' }} min
                </div>
              </div>
            </a>
          </li>
        }
      </ul>
    }
  `,
})
export class FeatureActivities {
  private readonly http = inject(HttpClient);

  protected readonly activities = signal<Activity[]>([]);
  protected readonly achievements = signal<AchievementsResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /**
   * Flatten the six PR slots into UI cards with formatted values. Each
   * slot is independent — missing data simply drops a card.
   */
  protected readonly prCards = computed<PrCard[]>(() => {
    const a = this.achievements();
    if (!a) return [];
    const cards: PrCard[] = [];
    if (a.longestDistance) {
      cards.push({
        key: 'distance',
        icon: 'route',
        label: 'Longest ride',
        value: (a.longestDistance.valueM / 1000).toFixed(1),
        unit: 'km',
        activityId: a.longestDistance.activity.id,
        activityName: a.longestDistance.activity.name,
        date: formatDate(a.longestDistance.activity.startTime),
      });
    }
    if (a.mostElevation) {
      cards.push({
        key: 'elev',
        icon: 'landscape',
        label: 'Most elevation',
        value: Math.round(a.mostElevation.valueM).toString(),
        unit: 'm',
        activityId: a.mostElevation.activity.id,
        activityName: a.mostElevation.activity.name,
        date: formatDate(a.mostElevation.activity.startTime),
      });
    }
    if (a.longestDuration) {
      cards.push({
        key: 'time',
        icon: 'schedule',
        label: 'Longest time',
        value: formatHm(a.longestDuration.valueSec),
        unit: '',
        activityId: a.longestDuration.activity.id,
        activityName: a.longestDuration.activity.name,
        date: formatDate(a.longestDuration.activity.startTime),
      });
    }
    if (a.highestAvgSpeed) {
      cards.push({
        key: 'avg-speed',
        icon: 'trending_up',
        label: 'Fastest avg',
        value: (a.highestAvgSpeed.valueMps * 3.6).toFixed(1),
        unit: 'km/h',
        activityId: a.highestAvgSpeed.activity.id,
        activityName: a.highestAvgSpeed.activity.name,
        date: formatDate(a.highestAvgSpeed.activity.startTime),
      });
    }
    if (a.highestMaxSpeed) {
      cards.push({
        key: 'max-speed',
        icon: 'bolt',
        label: 'Top speed',
        value: (a.highestMaxSpeed.valueMps * 3.6).toFixed(1),
        unit: 'km/h',
        activityId: a.highestMaxSpeed.activity.id,
        activityName: a.highestMaxSpeed.activity.name,
        date: formatDate(a.highestMaxSpeed.activity.startTime),
      });
    }
    if (a.fastestLap) {
      cards.push({
        key: 'fastest-lap',
        icon: 'speed',
        label: 'Fastest lap',
        value: (a.fastestLap.valueMps * 3.6).toFixed(1),
        unit: 'km/h',
        activityId: a.fastestLap.activity.id,
        activityName: a.fastestLap.activity.name,
        date: formatDate(a.fastestLap.activity.startTime),
      });
    }
    return cards;
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.http.get<Activity[]>('/api/activities').subscribe({
      next: (rows) => {
        this.activities.set(rows);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message ?? 'Failed to load activities');
        this.loading.set(false);
      },
    });
    // Fire-and-forget — the panel hides itself until data lands.
    this.http
      .get<AchievementsResponse>('/api/activities/achievements')
      .subscribe({
        next: (r) => this.achievements.set(r),
        error: () => this.achievements.set(null),
      });
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatHm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, '0')}`;
  return `${m}m`;
}
