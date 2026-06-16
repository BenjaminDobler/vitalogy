import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import type { Workout, WorkoutStatus } from 'data-models';
import { IntervalBarComponent } from '../interval-bar/interval-bar.component.js';
import { formatDuration, formatTarget, targetColor } from '../format-target.js';

@Component({
  selector: 'lib-workout-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, IntervalBarComponent],
  template: `
    <div class="mb-4">
      <a routerLink="/workouts" class="text-sm text-on-surface-variant hover:underline">
        ← Back to workouts
      </a>
    </div>

    @if (loading()) {
      <p class="text-on-surface-variant">Loading…</p>
    } @else if (workout(); as w) {
      <header class="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div class="min-w-0 flex-1">
          <h1 class="font-sora text-3xl font-bold tracking-tight text-on-surface">{{ w.title }}</h1>
          <p class="text-sm text-on-surface-variant mt-1">
            {{ fmtDuration(w.totalSec) }} · {{ w.intervals.length }} intervals
            @if (w.estimatedTss != null) { · ~{{ w.estimatedTss }} TSS }
            · {{ w.createdBy === 'COACH' ? 'From coach' : 'Self-built' }}
            @if (w.scheduledFor) { · scheduled {{ w.scheduledFor | date: 'MMM d' }} }
          </p>
          @if (w.description) {
            <p class="mt-3 text-sm text-on-surface leading-relaxed max-w-2xl">{{ w.description }}</p>
          }
        </div>
        <div class="flex flex-col items-end gap-2">
          <span class="text-[11px] font-grotesk uppercase tracking-wider px-2.5 py-1 rounded-full border"
                [class]="statusClass(w.status)">{{ w.status.replace('_', ' ') }}</span>
          @if (w.status === 'PLANNED') {
            <button
              type="button"
              (click)="setStatus('SKIPPED')"
              class="text-xs text-on-surface-variant hover:text-rose-300"
            >Skip</button>
          }
          <button
            type="button"
            (click)="remove()"
            class="text-xs text-on-surface-variant hover:text-rose-300"
            title="Delete this workout"
          >Delete</button>
        </div>
      </header>

      <section class="velo-glass rounded-xl p-5 mb-6">
        <h2 class="font-grotesk text-label-caps text-on-surface uppercase text-xs mb-3">
          Plan
        </h2>
        <lib-interval-bar [intervals]="w.intervals" />
        <div class="mt-3 flex flex-wrap gap-2 text-[10px] font-grotesk uppercase tracking-wider">
          @for (iv of w.intervals; track iv.index) {
            <span class="flex items-center gap-1 px-2 py-0.5 rounded-full border" [style.border-color]="colorFor(iv.target) + '66'" [style.color]="colorFor(iv.target)">
              <span class="w-1.5 h-1.5 rounded-full" [style.background-color]="colorFor(iv.target)"></span>
              {{ fmtTarget(iv.target) }}
            </span>
          }
        </div>
      </section>

      <section>
        <h2 class="font-grotesk text-label-caps text-on-surface uppercase text-xs mb-3">
          Intervals
        </h2>
        <div class="velo-glass rounded-xl overflow-hidden">
          <table class="w-full text-sm tabular-nums">
            <thead class="bg-white/5 text-on-surface-variant text-left text-[10px] uppercase tracking-wider">
              <tr>
                <th class="px-3 py-2 font-medium">#</th>
                <th class="px-3 py-2 font-medium">Label</th>
                <th class="px-3 py-2 font-medium">Duration</th>
                <th class="px-3 py-2 font-medium">Target</th>
                <th class="px-3 py-2 font-medium">Cue</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              @for (iv of w.intervals; track iv.index) {
                <tr>
                  <td class="px-3 py-2 text-on-surface-variant">{{ iv.index + 1 }}</td>
                  <td class="px-3 py-2 text-on-surface">{{ iv.label }}</td>
                  <td class="px-3 py-2 text-velo-lime">{{ fmtDuration(iv.durationSec) }}</td>
                  <td class="px-3 py-2">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-grotesk uppercase tracking-wider border"
                          [style.border-color]="colorFor(iv.target) + '66'"
                          [style.color]="colorFor(iv.target)">
                      {{ fmtTarget(iv.target) }}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-on-surface-variant text-xs">{{ iv.cue ?? '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <p class="text-xs text-on-surface-variant mt-6 text-center">
        Open the Vitalogy mobile app to start this workout with live guidance.
      </p>
    } @else if (error(); as e) {
      <p class="text-rose-300">{{ e }}</p>
    }
  `,
})
export class WorkoutDetailComponent {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly workout = signal<Workout | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => this.load(this.id()));
  }

  private load(id: string): void {
    this.loading.set(true);
    this.http.get<Workout>(`/api/workouts/${id}`).subscribe({
      next: (w) => {
        this.workout.set(w);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message ?? err.message ?? 'Could not load workout');
        this.loading.set(false);
      },
    });
  }

  protected setStatus(status: WorkoutStatus): void {
    const w = this.workout();
    if (!w) return;
    this.http
      .patch<Workout>(`/api/workouts/${w.id}`, { status })
      .subscribe({ next: (u) => this.workout.set(u) });
  }

  protected remove(): void {
    const w = this.workout();
    if (!w) return;
    this.http.delete(`/api/workouts/${w.id}`).subscribe({
      next: () => this.router.navigate(['/workouts']),
    });
  }

  protected fmtDuration(s: number): string {
    return formatDuration(s);
  }

  protected fmtTarget(t: Workout['intervals'][number]['target']): string {
    return formatTarget(t);
  }

  protected colorFor(t: Workout['intervals'][number]['target']): string {
    return targetColor(t);
  }

  protected statusClass(status: WorkoutStatus): string {
    switch (status) {
      case 'PLANNED': return 'bg-velo-lime/15 border-velo-lime/40 text-velo-lime';
      case 'IN_PROGRESS': return 'bg-sky-400/15 border-sky-400/40 text-sky-300';
      case 'COMPLETED': return 'bg-white/10 border-white/15 text-on-surface-variant';
      case 'SKIPPED': return 'bg-rose-400/15 border-rose-400/40 text-rose-300';
    }
  }
}
