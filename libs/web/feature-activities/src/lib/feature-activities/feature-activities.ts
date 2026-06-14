import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { Activity } from 'data-models';

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
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

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
  }
}
