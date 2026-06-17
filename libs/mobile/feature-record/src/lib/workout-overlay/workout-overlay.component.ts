import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { WorkoutLiveContext } from 'recording';

/**
 * Live workout overlay shown above the metric tiles during a session
 * that was started with a workout context.
 *
 * Lead element is a big colored card showing:
 *   - current interval label + countdown
 *   - target range
 *   - current value (HR or watts depending on the target unit)
 *   - status pill: IN ZONE / PUSH HARDER / EASE OFF / —
 *
 * Below, a thin progress bar covers the whole workout so the rider
 * sees how far they've come without reading the time.
 */
@Component({
  selector: 'mobile-workout-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    @if (ctx(); as c) {
      <div
        class="rounded-2xl border-2"
        [class.p-3]="compact()"
        [class.mx-3]="compact()"
        [class.mb-2]="compact()"
        [class.p-4]="!compact()"
        [class.mx-4]="!compact()"
        [class.mb-4]="!compact()"
        [class.bg-velo-lime\\/15]="c.status === 'in'"
        [class.border-velo-lime]="c.status === 'in'"
        [class.bg-orange-500\\/15]="c.status === 'below'"
        [class.border-orange-400]="c.status === 'below'"
        [class.bg-rose-500\\/15]="c.status === 'above'"
        [class.border-rose-400]="c.status === 'above'"
        [class.bg-white\\/5]="c.status === 'unknown' || c.done"
        [class.border-white\\/15]="c.status === 'unknown' || c.done"
      >
        <div
          class="flex items-baseline justify-between"
          [class.mb-1]="compact()"
          [class.mb-2]="!compact()"
        >
          <span class="font-grotesk text-label-caps text-on-surface-variant uppercase text-[10px] tracking-wider">
            {{ c.done ? 'Workout complete' : 'Interval ' + (c.intervalIndex + 1) + ' / ' + c.workout.intervals.length }}
          </span>
          @if (!c.done) {
            <span
              class="font-sora text-velo-lime tabular-nums leading-none"
              [class.text-xl]="compact()"
              [class.text-2xl]="!compact()"
            >
              {{ fmtTime(c.intervalRemainingSec) }}
            </span>
          }
        </div>

        <div
          class="flex items-baseline justify-between gap-3"
          [class.mb-2]="compact()"
          [class.mb-3]="!compact()"
        >
          <div
            class="font-sora text-on-surface truncate"
            [class.text-base]="compact()"
            [class.text-xl]="!compact()"
          >
            {{ c.intervalLabel }}
          </div>
          <div class="font-grotesk text-label-caps text-on-surface-variant uppercase tracking-wider text-xs whitespace-nowrap">
            {{ c.target.label }}
          </div>
        </div>

        @if (!c.done) {
          <div class="flex items-end justify-between gap-3">
            <div>
              <div class="font-grotesk text-label-caps text-on-surface-variant uppercase text-[10px] tracking-wider mb-1">
                Now
              </div>
              <div
                class="font-sora tabular-nums leading-none"
                [class.text-3xl]="compact()"
                [class.text-4xl]="!compact()"
                [class.text-velo-lime]="c.status === 'in'"
                [class.text-orange-300]="c.status === 'below'"
                [class.text-rose-300]="c.status === 'above'"
                [class.text-on-surface-variant]="c.status === 'unknown'"
              >
                @if (c.currentValue != null) {
                  {{ c.currentValue | number: '1.0-0' }}
                  <span class="font-grotesk text-label-caps text-on-surface-variant text-[10px] uppercase tracking-wider ml-1">
                    {{ c.target.unit === 'bpm' ? 'bpm' : c.target.unit === 'watts' ? 'W' : '' }}
                  </span>
                } @else {
                  —
                }
              </div>
            </div>
            <span
              class="font-grotesk uppercase tracking-wider text-xs px-3 py-1.5 rounded-full"
              [class.bg-velo-lime]="c.status === 'in'"
              [class.text-velo-on-lime]="c.status === 'in'"
              [class.bg-orange-400]="c.status === 'below'"
              [class.text-orange-950]="c.status === 'below'"
              [class.bg-rose-400]="c.status === 'above'"
              [class.text-rose-950]="c.status === 'above'"
              [class.bg-white\\/10]="c.status === 'unknown'"
              [class.text-on-surface]="c.status === 'unknown'"
            >
              {{ statusLabel(c.status) }}
            </span>
          </div>
        }

        <div
          class="flex h-2 w-full rounded-full overflow-hidden bg-white/5"
          [class.mt-2]="compact()"
          [class.mt-3]="!compact()"
        >
          @for (s of segments(); track s.index) {
            <div
              [style.width.%]="s.widthPct"
              [style.background-color]="s.color"
              class="transition-opacity"
              [class.opacity-100]="s.index <= c.intervalIndex"
              [class.opacity-30]="s.index > c.intervalIndex"
            ></div>
          }
        </div>

        @if (!c.done && !compact()) {
          <div class="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              (click)="previous.emit()"
              [disabled]="c.intervalIndex === 0 && c.intervalElapsedSec < 1"
              class="flex-1 flex items-center justify-center gap-1 bg-white/5 hover:bg-white/10 active:scale-95 disabled:opacity-30 rounded-full py-2 transition-transform"
              aria-label="Previous interval"
            >
              <span class="material-symbols-outlined text-on-surface text-[18px]">skip_previous</span>
              <span class="font-grotesk text-label-caps uppercase text-[11px] tracking-wider text-on-surface">Back</span>
            </button>
            <button
              type="button"
              (click)="next.emit()"
              [disabled]="c.intervalIndex >= c.workout.intervals.length - 1 && c.intervalRemainingSec === 0"
              class="flex-1 flex items-center justify-center gap-1 bg-white/5 hover:bg-white/10 active:scale-95 disabled:opacity-30 rounded-full py-2 transition-transform"
              aria-label="Skip to next interval"
            >
              <span class="font-grotesk text-label-caps uppercase text-[11px] tracking-wider text-on-surface">Skip</span>
              <span class="material-symbols-outlined text-on-surface text-[18px]">skip_next</span>
            </button>
          </div>
        }
      </div>
    }
  `,
})
export class WorkoutOverlayComponent {
  readonly ctx = input.required<WorkoutLiveContext | null>();
  /**
   * When true, drop padding/font sizes by one notch and hide the
   * Back/Skip buttons so the overlay can sit above the sensor tile
   * grid in the Combined ride view. The Workout-only swipe page
   * uses the full (non-compact) layout.
   */
  readonly compact = input(false);

  /** Emitted when the rider taps Skip. Parent advances the workout. */
  readonly next = output<void>();
  /** Emitted when the rider taps Back. Parent rewinds the workout. */
  readonly previous = output<void>();

  protected readonly segments = computed(() => {
    const c = this.ctx();
    if (!c) return [];
    const total = c.workout.intervals.reduce((acc, i) => acc + i.durationSec, 0);
    if (total === 0) return [];
    return c.workout.intervals.map((iv) => ({
      index: iv.index,
      widthPct: (iv.durationSec / total) * 100,
      color: targetColor(iv.target),
    }));
  });

  protected fmtTime(sec: number): string {
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  }

  protected statusLabel(status: 'in' | 'below' | 'above' | 'unknown'): string {
    switch (status) {
      case 'in':      return 'In zone';
      case 'below':   return 'Push harder';
      case 'above':   return 'Ease off';
      case 'unknown': return 'Waiting…';
    }
  }
}

function targetColor(t: import('data-models').IntervalTarget): string {
  switch (t.kind) {
    case 'HR_ZONE':
      return { 1: '#3d4a1a', 2: '#5e7a26', 3: '#9ec635', 4: '#fb923c', 5: '#ef4444' }[t.zone];
    case 'HR_RANGE': return '#38bdf8';
    case 'POWER_RANGE': return '#a78bfa';
    case 'POWER_FTP_PCT': {
      const mid = (t.min + t.max) / 2;
      if (mid < 56) return '#3d4a1a';
      if (mid < 76) return '#5e7a26';
      if (mid < 91) return '#9ec635';
      if (mid < 106) return '#fb923c';
      return '#ef4444';
    }
    case 'RPE': return '#94a3b8';
    case 'FREE': return '#52525b';
  }
}
