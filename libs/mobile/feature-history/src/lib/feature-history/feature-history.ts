import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiClient } from 'api-client';
import { BottomNavComponent } from 'feature-record';
import type { Activity } from 'data-models';

@Component({
  selector: 'lib-feature-history',
  imports: [DatePipe, DecimalPipe, RouterLink, BottomNavComponent],
  template: `
    <div class="min-h-screen velo-carbon text-on-surface font-inter pb-24">
      <header class="px-5 pt-safe-6 pb-4 flex items-center justify-between border-b border-white/5">
        <span class="w-10"></span>
        <h1 class="font-sora italic uppercase tracking-tighter text-2xl text-velo-lime">
          ACTIVITY
        </h1>
        <button
          (click)="reload()"
          class="w-10 h-10 rounded-full velo-glass flex items-center justify-center hover:bg-white/10"
          aria-label="Refresh"
        >
          <span class="material-symbols-outlined text-on-surface text-[20px]">refresh</span>
        </button>
      </header>

      <div class="px-5 py-5 space-y-3">
        @if (loading()) {
          <p class="font-grotesk text-label-caps text-on-surface-variant uppercase text-center py-10">
            Loading…
          </p>
        } @else if (error(); as msg) {
          <p class="text-sm text-rose-300">{{ msg }}</p>
        } @else if (activities().length === 0) {
          <div class="velo-glass rounded-xl px-6 py-10 text-center">
            <span class="material-symbols-outlined text-on-surface-variant text-[36px]">
              calendar_today
            </span>
            <p class="font-grotesk text-label-caps text-on-surface-variant uppercase mt-3">
              No rides yet
            </p>
            <p class="text-sm text-on-surface-variant mt-2">
              Start your first ride from the Ride tab.
            </p>
          </div>
        } @else {
          @for (a of activities(); track a.id) {
            <a
              [routerLink]="['/activities', a.id]"
              class="velo-glass block rounded-xl px-5 py-4 flex items-baseline justify-between gap-4 hover:bg-white/10 transition-colors"
            >
              <div>
                <div class="font-sora text-lg font-bold text-on-surface leading-tight">
                  {{ a.name }}
                </div>
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mt-1">
                  {{ a.startTime | date: 'mediumDate' }} ·
                  {{ a.startTime | date: 'shortTime' }}
                </div>
              </div>
              <div class="font-sora tabular-nums text-right">
                <div class="text-velo-lime text-xl font-bold leading-none">
                  {{ a.distanceM / 1000 | number: '1.1-1' }}
                </div>
                <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mt-1">
                  km · {{ a.durationSec / 60 | number: '1.0-0' }} min
                </div>
              </div>
            </a>
          }
        }
      </div>

      <mobile-bottom-nav />
    </div>
  `,
})
export class FeatureHistory implements OnInit {
  private readonly api = inject(ApiClient);

  protected readonly activities = signal<Activity[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .get<Activity[]>('/api/activities')
      .then((rows) => {
        this.activities.set(rows);
        this.loading.set(false);
      })
      .catch((err) => {
        this.error.set(
          err instanceof Error ? err.message : 'Failed to load activities',
        );
        this.loading.set(false);
      });
  }
}
