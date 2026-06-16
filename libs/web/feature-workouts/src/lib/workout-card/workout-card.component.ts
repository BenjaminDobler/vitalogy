import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import type { Workout } from 'data-models';
import { IntervalBarComponent } from '../interval-bar/interval-bar.component.js';
import { formatDuration } from '../format-target.js';

/**
 * Compact "next pending workout" card for the activities home. Lazily
 * loads the first PLANNED workout and hides itself entirely when there
 * aren't any — the home page already has the chat panel for that case.
 */
@Component({
  selector: 'lib-workout-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, IntervalBarComponent],
  template: `
    @if (next(); as w) {
      <section class="mb-6">
        <h2 class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3">
          Planned workout
        </h2>
        <a
          [routerLink]="['/workouts', w.id]"
          class="velo-glass block rounded-xl p-5 hover:bg-white/10 transition-colors border-l-4 border-velo-lime"
        >
          <div class="flex items-baseline justify-between gap-4 mb-3">
            <div class="min-w-0">
              <div class="font-sora text-xl text-on-surface">{{ w.title }}</div>
              <div class="font-grotesk text-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider mt-0.5">
                {{ w.createdBy === 'COACH' ? 'From coach' : 'Self-built' }}
                @if (w.scheduledFor) {
                  · {{ w.scheduledFor | date: 'EEEE, MMM d' }}
                }
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="font-sora text-velo-lime text-2xl tabular-nums leading-none">
                {{ fmtDuration(w.totalSec) }}
              </div>
              <div class="font-grotesk text-[10px] text-on-surface-variant uppercase tracking-wider mt-1">
                {{ w.intervals.length }} intervals
                @if (w.estimatedTss != null) { · ~{{ w.estimatedTss }} TSS }
              </div>
            </div>
          </div>
          <lib-interval-bar [intervals]="w.intervals" />
          @if (w.description) {
            <p class="text-xs text-on-surface-variant mt-3 line-clamp-2">{{ w.description }}</p>
          }
          <p class="text-[10px] text-on-surface-variant mt-3">
            Open on mobile to ride this with live guidance →
          </p>
        </a>
      </section>
    }
  `,
})
export class WorkoutCardComponent {
  private readonly http = inject(HttpClient);

  protected readonly next = signal<Workout | null>(null);

  constructor() {
    this.load();
  }

  private load(): void {
    this.http
      .get<Workout[]>('/api/workouts?pending=true')
      .subscribe({
        next: (rows) => {
          const planned = rows.find((w) => w.status === 'PLANNED' || w.status === 'IN_PROGRESS');
          this.next.set(planned ?? null);
        },
        error: () => this.next.set(null),
      });
  }

  protected fmtDuration(s: number): string {
    return formatDuration(s);
  }
}
