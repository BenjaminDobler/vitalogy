import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
} from '@angular/core';
import { WorkoutsService } from 'api-client';
import type { Workout } from 'data-models';

/**
 * Sits above the "Start recording" button when nothing's in progress.
 * Lazily lists planned workouts and emits `select(workout)` when the
 * rider taps one — feature-record then calls
 * `recordingService.start({ workout })` to enter workout-execution mode.
 *
 * Hides itself entirely when no workouts are pending.
 */
@Component({
  selector: 'mobile-workout-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pending().length > 0) {
      <div class="velo-glass rounded-2xl p-4 mx-4 mb-4">
        <div class="flex items-center gap-2 mb-3">
          <span class="material-symbols-outlined text-velo-lime text-[20px]">flag</span>
          <span class="font-grotesk text-label-caps text-on-surface uppercase tracking-wider text-xs">
            Planned workouts
          </span>
        </div>
        <ul class="space-y-2">
          @for (w of pending(); track w.id) {
            <li>
              <button
                type="button"
                (click)="onTap(w)"
                class="w-full text-left bg-white/5 hover:bg-white/10 rounded-xl p-3 flex items-center gap-3"
              >
                <span class="material-symbols-outlined text-velo-lime">play_circle</span>
                <div class="flex-1 min-w-0">
                  <div class="font-sora text-on-surface text-base truncate">{{ w.title }}</div>
                  <div class="text-[10px] text-on-surface-variant uppercase tracking-wider font-grotesk">
                    {{ fmtDuration(w.totalSec) }} · {{ w.intervals.length }} intervals
                    @if (w.estimatedTss != null) { · ~{{ w.estimatedTss }} TSS }
                  </div>
                </div>
              </button>
            </li>
          }
        </ul>
      </div>
    }
  `,
})
export class WorkoutPickerComponent {
  private readonly workouts = inject(WorkoutsService);

  readonly select = output<Workout>();

  protected readonly pending = signal<Workout[]>([]);

  constructor() {
    this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const list = await this.workouts.listPending();
      this.pending.set(list);
    } catch {
      this.pending.set([]);
    }
  }

  protected onTap(w: Workout): void {
    this.select.emit(w);
  }

  protected fmtDuration(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h${m.toString().padStart(2, '0')}`;
    return `${m}m`;
  }
}
