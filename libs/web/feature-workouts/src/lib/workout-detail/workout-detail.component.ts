import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import type {
  IntervalTarget,
  IntervalTargetKind,
  Workout,
  WorkoutInterval,
  WorkoutStatus,
} from 'data-models';
import { IntervalBarComponent } from '../interval-bar/interval-bar.component.js';
import { formatDuration, formatTarget, targetColor } from '../format-target.js';

const TARGET_KINDS: { kind: IntervalTargetKind; label: string }[] = [
  { kind: 'HR_ZONE', label: 'HR Zone' },
  { kind: 'HR_RANGE', label: 'HR bpm' },
  { kind: 'POWER_FTP_PCT', label: '% FTP' },
  { kind: 'POWER_RANGE', label: 'Power W' },
  { kind: 'RPE', label: 'RPE' },
  { kind: 'FREE', label: 'Free' },
];

@Component({
  selector: 'lib-workout-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, RouterLink, IntervalBarComponent],
  template: `
    <div class="mb-4">
      <a routerLink="/workouts" class="text-sm text-on-surface-variant hover:underline">
        ← Back to workouts
      </a>
    </div>

    @if (loading()) {
      <p class="text-on-surface-variant">Loading…</p>
    } @else if (workout(); as w) {
      @let edit = editing();
      <header class="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div class="min-w-0 flex-1">
          @if (edit) {
            <input
              type="text"
              [(ngModel)]="draftTitle"
              class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-on-surface font-sora text-2xl"
            />
            <textarea
              [(ngModel)]="draftDescription"
              rows="3"
              placeholder="Optional description / notes…"
              class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-on-surface text-sm mt-3 max-w-2xl"
            ></textarea>
          } @else {
            <h1 class="font-sora text-3xl font-bold tracking-tight text-on-surface">{{ w.title }}</h1>
            <p class="text-sm text-on-surface-variant mt-1">
              {{ fmtDuration(totalSecPreview()) }} · {{ workingIntervals().length }} intervals
              @if (w.estimatedTss != null) { · ~{{ w.estimatedTss }} TSS }
              · {{ w.createdBy === 'COACH' ? 'From coach' : 'Self-built' }}
              @if (w.scheduledFor) { · scheduled {{ w.scheduledFor | date: 'MMM d' }} }
            </p>
            @if (w.description) {
              <p class="mt-3 text-sm text-on-surface leading-relaxed max-w-2xl whitespace-pre-line">{{ w.description }}</p>
            }
          }
        </div>
        <div class="flex flex-col items-end gap-2">
          @if (!edit) {
            <span class="text-[11px] font-grotesk uppercase tracking-wider px-2.5 py-1 rounded-full border"
                  [class]="statusClass(w.status)">{{ w.status.replace('_', ' ') }}</span>
            <button
              type="button"
              (click)="startEdit()"
              class="text-xs px-3 py-1 rounded-full bg-velo-lime/15 border border-velo-lime/40 text-velo-lime hover:bg-velo-lime/25"
            >Edit</button>
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
          } @else {
            <button
              type="button"
              (click)="save()"
              [disabled]="saving()"
              class="text-xs px-3 py-1 rounded-full bg-velo-lime text-velo-on-lime font-grotesk uppercase tracking-wider disabled:opacity-50"
            >{{ saving() ? 'Saving…' : 'Save' }}</button>
            <button
              type="button"
              (click)="cancelEdit()"
              class="text-xs px-3 py-1 rounded-full velo-glass text-on-surface hover:bg-white/10"
            >Cancel</button>
          }
        </div>
      </header>

      <section class="velo-glass rounded-xl p-5 mb-6">
        <h2 class="font-grotesk text-label-caps text-on-surface uppercase text-xs mb-3">
          Plan
        </h2>
        <lib-interval-bar [intervals]="workingIntervals()" />
        <div class="mt-3 flex flex-wrap gap-2 text-[10px] font-grotesk uppercase tracking-wider">
          @for (iv of workingIntervals(); track iv.index) {
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
        @if (!edit) {
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
                @for (iv of workingIntervals(); track iv.index) {
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
        } @else {
          <div class="space-y-3">
            @for (iv of workingIntervals(); track iv.index) {
              <div class="velo-glass rounded-xl p-4 grid grid-cols-12 gap-3 items-center">
                <div class="col-span-12 sm:col-span-1 flex sm:flex-col gap-2 items-center justify-center text-on-surface-variant">
                  <button type="button" (click)="moveInterval(iv.index, -1)" [disabled]="iv.index === 0"
                          class="w-7 h-7 rounded hover:bg-white/10 disabled:opacity-30 flex items-center justify-center">
                    <span class="material-symbols-outlined text-[18px]">arrow_upward</span>
                  </button>
                  <span class="font-sora">{{ iv.index + 1 }}</span>
                  <button type="button" (click)="moveInterval(iv.index, 1)" [disabled]="iv.index === workingIntervals().length - 1"
                          class="w-7 h-7 rounded hover:bg-white/10 disabled:opacity-30 flex items-center justify-center">
                    <span class="material-symbols-outlined text-[18px]">arrow_downward</span>
                  </button>
                </div>
                <div class="col-span-12 sm:col-span-3">
                  <label class="block text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Label</label>
                  <input type="text" [ngModel]="iv.label" (ngModelChange)="updateInterval(iv.index, { label: $event })"
                         class="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-on-surface text-sm" />
                </div>
                <div class="col-span-6 sm:col-span-2">
                  <label class="block text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Min</label>
                  <input type="number" min="0" step="1" [ngModel]="Math.floor(iv.durationSec / 60)"
                         (ngModelChange)="setDurationMinutes(iv.index, $event)"
                         class="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-on-surface tabular-nums text-sm" />
                </div>
                <div class="col-span-6 sm:col-span-2">
                  <label class="block text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Sec</label>
                  <input type="number" min="0" max="59" step="1" [ngModel]="iv.durationSec % 60"
                         (ngModelChange)="setDurationSeconds(iv.index, $event)"
                         class="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-on-surface tabular-nums text-sm" />
                </div>
                <div class="col-span-12 sm:col-span-3 flex items-end gap-2">
                  <div class="flex-1">
                    <label class="block text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Target</label>
                    <select [ngModel]="iv.target.kind" (ngModelChange)="setTargetKind(iv.index, $event)"
                            class="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-on-surface text-sm">
                      @for (k of targetKinds; track k.kind) {
                        <option [value]="k.kind">{{ k.label }}</option>
                      }
                    </select>
                  </div>
                  <button type="button" (click)="removeInterval(iv.index)"
                          class="w-9 h-9 rounded hover:bg-rose-400/15 text-rose-300 flex items-center justify-center"
                          title="Delete interval">
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>

                <!-- Target value editor — varies by kind -->
                <div class="col-span-12 sm:col-start-2 sm:col-span-11 flex flex-wrap items-center gap-3">
                  @switch (iv.target.kind) {
                    @case ('HR_ZONE') {
                      <label class="text-xs text-on-surface-variant flex items-center gap-2">
                        Zone
                        <select [ngModel]="iv.target.zone"
                                (ngModelChange)="setZone(iv.index, +$event)"
                                class="bg-white/5 border border-white/10 rounded px-2 py-1 text-on-surface text-sm">
                          @for (z of [1, 2, 3, 4, 5]; track z) {
                            <option [value]="z">Z{{ z }}</option>
                          }
                        </select>
                      </label>
                    }
                    @case ('HR_RANGE') {
                      <label class="text-xs text-on-surface-variant flex items-center gap-2">
                        Min bpm
                        <input type="number" min="50" max="220" [ngModel]="iv.target.min"
                               (ngModelChange)="updateTarget(iv.index, { min: +$event })"
                               class="bg-white/5 border border-white/10 rounded px-2 py-1 w-20 text-on-surface tabular-nums text-sm" />
                      </label>
                      <label class="text-xs text-on-surface-variant flex items-center gap-2">
                        Max bpm
                        <input type="number" min="50" max="220" [ngModel]="iv.target.max"
                               (ngModelChange)="updateTarget(iv.index, { max: +$event })"
                               class="bg-white/5 border border-white/10 rounded px-2 py-1 w-20 text-on-surface tabular-nums text-sm" />
                      </label>
                    }
                    @case ('POWER_RANGE') {
                      <label class="text-xs text-on-surface-variant flex items-center gap-2">
                        Min W
                        <input type="number" min="0" max="2000" [ngModel]="iv.target.min"
                               (ngModelChange)="updateTarget(iv.index, { min: +$event })"
                               class="bg-white/5 border border-white/10 rounded px-2 py-1 w-20 text-on-surface tabular-nums text-sm" />
                      </label>
                      <label class="text-xs text-on-surface-variant flex items-center gap-2">
                        Max W
                        <input type="number" min="0" max="2000" [ngModel]="iv.target.max"
                               (ngModelChange)="updateTarget(iv.index, { max: +$event })"
                               class="bg-white/5 border border-white/10 rounded px-2 py-1 w-20 text-on-surface tabular-nums text-sm" />
                      </label>
                    }
                    @case ('POWER_FTP_PCT') {
                      <label class="text-xs text-on-surface-variant flex items-center gap-2">
                        Min %
                        <input type="number" min="20" max="200" [ngModel]="iv.target.min"
                               (ngModelChange)="updateTarget(iv.index, { min: +$event })"
                               class="bg-white/5 border border-white/10 rounded px-2 py-1 w-16 text-on-surface tabular-nums text-sm" />
                      </label>
                      <label class="text-xs text-on-surface-variant flex items-center gap-2">
                        Max %
                        <input type="number" min="20" max="200" [ngModel]="iv.target.max"
                               (ngModelChange)="updateTarget(iv.index, { max: +$event })"
                               class="bg-white/5 border border-white/10 rounded px-2 py-1 w-16 text-on-surface tabular-nums text-sm" />
                      </label>
                    }
                    @case ('RPE') {
                      <label class="text-xs text-on-surface-variant flex items-center gap-2">
                        RPE
                        <input type="number" min="1" max="10" [ngModel]="iv.target.rpe"
                               (ngModelChange)="updateTarget(iv.index, { rpe: +$event })"
                               class="bg-white/5 border border-white/10 rounded px-2 py-1 w-16 text-on-surface tabular-nums text-sm" />
                      </label>
                    }
                    @case ('FREE') {
                      <span class="text-xs text-on-surface-variant">No live comparison — for warm-up / cool-down / open riding.</span>
                    }
                  }
                  <input type="text" [ngModel]="iv.cue ?? ''"
                         (ngModelChange)="updateInterval(iv.index, { cue: $event || undefined })"
                         placeholder="Cue shown on the overlay (optional)"
                         class="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-on-surface text-sm min-w-[200px]" />
                </div>
              </div>
            }
            <button
              type="button"
              (click)="addInterval()"
              class="w-full velo-glass rounded-xl py-3 text-on-surface-variant hover:bg-white/10 text-sm flex items-center justify-center gap-2"
            >
              <span class="material-symbols-outlined text-[18px]">add</span>
              Add interval
            </button>
            @if (editError(); as e) {
              <p class="text-xs text-rose-300">{{ e }}</p>
            }
          </div>
        }
      </section>

      @if (!edit) {
        <p class="text-xs text-on-surface-variant mt-6 text-center">
          Open the Vitalogy mobile app to start this workout with live guidance.
        </p>
      }
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

  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly editError = signal<string | null>(null);

  /** Working copy of intervals, mutated while editing. */
  protected readonly workingIntervals = signal<WorkoutInterval[]>([]);
  protected draftTitle = '';
  protected draftDescription = '';

  protected readonly targetKinds = TARGET_KINDS;
  protected readonly Math = Math;

  protected readonly totalSecPreview = computed(() =>
    this.workingIntervals().reduce((acc, i) => acc + i.durationSec, 0),
  );

  constructor() {
    effect(() => this.load(this.id()));
  }

  private load(id: string): void {
    this.loading.set(true);
    this.http.get<Workout>(`/api/workouts/${id}`).subscribe({
      next: (w) => {
        this.workout.set(w);
        this.workingIntervals.set(w.intervals.map((iv) => ({ ...iv })));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.message ?? err.message ?? 'Could not load workout');
        this.loading.set(false);
      },
    });
  }

  // -- edit mode lifecycle -------------------------------------------------

  protected startEdit(): void {
    const w = this.workout();
    if (!w) return;
    this.draftTitle = w.title;
    this.draftDescription = w.description ?? '';
    this.workingIntervals.set(w.intervals.map((iv) => ({ ...iv, target: { ...iv.target } })));
    this.editError.set(null);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    const w = this.workout();
    if (w) this.workingIntervals.set(w.intervals.map((iv) => ({ ...iv })));
    this.editing.set(false);
    this.editError.set(null);
  }

  protected save(): void {
    const w = this.workout();
    if (!w) return;
    const intervals = this.workingIntervals().map((iv, i) => ({
      ...iv,
      index: i,
      label: iv.label.trim() || `Interval ${i + 1}`,
      durationSec: Math.max(5, Math.round(iv.durationSec)),
    }));
    if (intervals.length === 0) {
      this.editError.set('A workout needs at least one interval.');
      return;
    }
    this.saving.set(true);
    this.http
      .patch<Workout>(`/api/workouts/${w.id}`, {
        title: this.draftTitle.trim() || w.title,
        description: this.draftDescription.trim() || null,
        intervals,
      })
      .subscribe({
        next: (u) => {
          this.workout.set(u);
          this.workingIntervals.set(u.intervals.map((iv) => ({ ...iv })));
          this.saving.set(false);
          this.editing.set(false);
        },
        error: (err) => {
          this.saving.set(false);
          this.editError.set(err.error?.message ?? err.message ?? 'Could not save');
        },
      });
  }

  // -- interval mutations --------------------------------------------------

  protected updateInterval(index: number, patch: Partial<WorkoutInterval>): void {
    this.workingIntervals.update((arr) =>
      arr.map((iv, i) => (i === index ? { ...iv, ...patch } : iv)),
    );
  }

  protected setDurationMinutes(index: number, minutes: number): void {
    const safe = Math.max(0, Math.floor(Number(minutes) || 0));
    this.workingIntervals.update((arr) =>
      arr.map((iv, i) =>
        i === index ? { ...iv, durationSec: safe * 60 + (iv.durationSec % 60) } : iv,
      ),
    );
  }

  protected setDurationSeconds(index: number, seconds: number): void {
    const safe = Math.max(0, Math.min(59, Math.floor(Number(seconds) || 0)));
    this.workingIntervals.update((arr) =>
      arr.map((iv, i) =>
        i === index
          ? { ...iv, durationSec: Math.floor(iv.durationSec / 60) * 60 + safe }
          : iv,
      ),
    );
  }

  protected setTargetKind(index: number, kind: IntervalTargetKind): void {
    this.workingIntervals.update((arr) =>
      arr.map((iv, i) => (i === index ? { ...iv, target: defaultTarget(kind) } : iv)),
    );
  }

  protected setZone(index: number, zone: number): void {
    const z = Math.max(1, Math.min(5, Math.round(zone))) as 1 | 2 | 3 | 4 | 5;
    this.workingIntervals.update((arr) =>
      arr.map((iv, i) =>
        i === index ? { ...iv, target: { kind: 'HR_ZONE', zone: z } } : iv,
      ),
    );
  }

  protected updateTarget(index: number, patch: Partial<IntervalTarget>): void {
    this.workingIntervals.update((arr) =>
      arr.map((iv, i) =>
        i === index
          ? { ...iv, target: { ...iv.target, ...patch } as IntervalTarget }
          : iv,
      ),
    );
  }

  protected addInterval(): void {
    const newInterval: WorkoutInterval = {
      index: this.workingIntervals().length,
      label: 'Interval',
      durationSec: 300,
      target: { kind: 'HR_ZONE', zone: 2 },
    };
    this.workingIntervals.update((arr) => [...arr, newInterval]);
  }

  protected removeInterval(index: number): void {
    this.workingIntervals.update((arr) =>
      arr.filter((_, i) => i !== index).map((iv, i) => ({ ...iv, index: i })),
    );
  }

  protected moveInterval(index: number, delta: -1 | 1): void {
    this.workingIntervals.update((arr) => {
      const target = index + delta;
      if (target < 0 || target >= arr.length) return arr;
      const next = arr.slice();
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next.map((iv, i) => ({ ...iv, index: i }));
    });
  }

  // -- existing actions ----------------------------------------------------

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

  protected fmtTarget(t: IntervalTarget): string {
    return formatTarget(t);
  }

  protected colorFor(t: IntervalTarget): string {
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

/**
 * Sensible default values when the rider switches target kind so the
 * interval is immediately valid (don't want partially-typed numbers
 * blocking the Save click).
 */
function defaultTarget(kind: IntervalTargetKind): IntervalTarget {
  switch (kind) {
    case 'HR_ZONE': return { kind, zone: 2 };
    case 'HR_RANGE': return { kind, min: 130, max: 150 };
    case 'POWER_RANGE': return { kind, min: 180, max: 220 };
    case 'POWER_FTP_PCT': return { kind, min: 65, max: 75 };
    case 'RPE': return { kind, rpe: 6 };
    case 'FREE': return { kind };
  }
}
