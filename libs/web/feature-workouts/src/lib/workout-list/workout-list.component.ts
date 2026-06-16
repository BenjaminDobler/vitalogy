import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import type { Workout } from 'data-models';
import { IntervalBarComponent } from '../interval-bar/interval-bar.component.js';
import { formatDuration } from '../format-target.js';

@Component({
  selector: 'lib-workout-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, IntervalBarComponent],
  template: `
    <div class="flex items-baseline justify-between mb-6">
      <h1 class="font-sora italic uppercase tracking-tighter text-3xl text-velo-lime">
        Workouts
      </h1>
      <div class="flex gap-2 text-xs font-grotesk uppercase">
        @for (t of tabs; track t.key) {
          <button
            type="button"
            (click)="setTab(t.key)"
            class="px-3 py-1.5 rounded-full"
            [class]="tab() === t.key
              ? 'bg-velo-lime text-velo-on-lime'
              : 'velo-glass text-on-surface hover:bg-white/10'"
          >{{ t.label }}</button>
        }
      </div>
    </div>

    @if (loading()) {
      <p class="text-on-surface-variant">Loading…</p>
    } @else if (filtered().length === 0) {
      <div class="velo-glass rounded-xl p-10 text-center text-on-surface-variant">
        <p class="mb-2">No {{ tab() === 'pending' ? 'planned' : '' }} workouts yet.</p>
        <p class="text-xs">Ask your coach to plan one — or open the chat on the home page.</p>
      </div>
    } @else {
      <ul class="space-y-3">
        @for (w of filtered(); track w.id) {
          <li>
            <a
              [routerLink]="['/workouts', w.id]"
              class="velo-glass block px-5 py-4 rounded-xl hover:bg-white/10 transition-colors"
            >
              <div class="flex items-baseline justify-between gap-4 mb-2">
                <div>
                  <div class="font-sora text-lg text-on-surface">{{ w.title }}</div>
                  <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mt-0.5 text-[10px]">
                    {{ w.createdBy === 'COACH' ? 'From coach' : 'Self-built' }}
                    @if (w.scheduledFor) {
                      · scheduled {{ w.scheduledFor | date: 'MMM d' }}
                    }
                  </div>
                </div>
                <div class="text-right">
                  <div class="font-sora text-velo-lime tabular-nums text-xl">
                    {{ fmtDuration(w.totalSec) }}
                  </div>
                  <div class="font-grotesk text-[10px] text-on-surface-variant uppercase tracking-wider">
                    {{ w.intervals.length }} interval{{ w.intervals.length === 1 ? '' : 's' }}
                    @if (w.estimatedTss != null) {
                      · ~{{ w.estimatedTss }} TSS
                    }
                  </div>
                </div>
              </div>
              <lib-interval-bar [intervals]="w.intervals" />
              <div class="mt-2 flex items-center justify-between">
                <span class="text-[10px] font-grotesk uppercase tracking-wider px-2 py-0.5 rounded-full border"
                      [class]="statusClass(w.status)">{{ w.status.replace('_', ' ') }}</span>
                @if (w.status === 'COMPLETED' && w.completedAt) {
                  <span class="text-[10px] text-on-surface-variant">Done {{ w.completedAt | date: 'MMM d, h:mma' }}</span>
                }
              </div>
            </a>
          </li>
        }
      </ul>
    }
  `,
})
export class WorkoutListComponent {
  private readonly http = inject(HttpClient);

  protected readonly tabs = [
    { key: 'pending' as const, label: 'Planned' },
    { key: 'all' as const, label: 'All' },
  ];

  protected readonly tab = signal<'pending' | 'all'>('pending');
  protected readonly workouts = signal<Workout[]>([]);
  protected readonly loading = signal(true);

  protected readonly filtered = () =>
    this.tab() === 'pending'
      ? this.workouts().filter(
          (w) => w.status === 'PLANNED' || w.status === 'IN_PROGRESS',
        )
      : this.workouts();

  constructor() {
    this.load();
  }

  protected setTab(key: 'pending' | 'all'): void {
    this.tab.set(key);
  }

  private load(): void {
    this.loading.set(true);
    this.http.get<Workout[]>('/api/workouts').subscribe({
      next: (w) => {
        this.workouts.set(w);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected fmtDuration(sec: number): string {
    return formatDuration(sec);
  }

  protected statusClass(status: Workout['status']): string {
    switch (status) {
      case 'PLANNED': return 'bg-velo-lime/15 border-velo-lime/40 text-velo-lime';
      case 'IN_PROGRESS': return 'bg-sky-400/15 border-sky-400/40 text-sky-300';
      case 'COMPLETED': return 'bg-white/10 border-white/15 text-on-surface-variant';
      case 'SKIPPED': return 'bg-rose-400/15 border-rose-400/40 text-rose-300';
    }
  }
}
