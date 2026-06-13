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
      <h1 class="text-2xl font-semibold">Activities</h1>
      <button
        (click)="reload()"
        class="text-sm px-3 py-1.5 rounded-md border border-slate-300 hover:bg-slate-100"
      >
        Refresh
      </button>
    </div>

    @if (loading()) {
      <p class="text-slate-500">Loading…</p>
    } @else if (error()) {
      <p class="text-rose-600">{{ error() }}</p>
    } @else if (activities().length === 0) {
      <div class="rounded-lg border border-dashed border-slate-300 p-10 text-center text-slate-500">
        <p>No activities yet.</p>
        <p class="text-sm mt-2">Head over to <a routerLink="/import" class="underline">Import</a> to pull from Strava.</p>
      </div>
    } @else {
      <ul class="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        @for (a of activities(); track a.id) {
          <li>
            <a
              [routerLink]="['/activities', a.id]"
              class="block px-4 py-3 flex items-baseline justify-between gap-4 hover:bg-slate-50"
            >
              <div>
                <div class="font-medium">{{ a.name }}</div>
                <div class="text-xs text-slate-500">
                  {{ a.startTime | date: 'medium' }} · {{ a.sportType }}
                </div>
              </div>
              <div class="text-sm text-slate-700 tabular-nums">
                {{ (a.distanceM / 1000) | number: '1.1-1' }} km ·
                {{ a.durationSec / 60 | number: '1.0-0' }} min
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
