import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { WorkoutInterval } from 'data-models';
import {
  formatDuration,
  formatTarget,
  targetColor,
  totalSeconds,
} from '../format-target.js';

interface Segment {
  index: number;
  label: string;
  target: string;
  durationSec: number;
  durationLabel: string;
  color: string;
  widthPct: number;
}

/**
 * Horizontal stacked bar of a workout's intervals. Each segment is
 * proportional to its duration; color comes from the target kind / zone.
 * Hover reveals interval label + duration; the segments themselves are
 * tappable when `selectable` is on (used by the live mobile overlay).
 */
@Component({
  selector: 'lib-interval-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-3 w-full rounded-full overflow-hidden bg-white/5">
      @for (s of segments(); track s.index) {
        <div
          [style.width.%]="s.widthPct"
          [style.background-color]="s.color"
          [class.opacity-100]="!activeIndex() || activeIndex() === s.index"
          [class.opacity-40]="activeIndex() != null && activeIndex() !== s.index"
          class="transition-opacity"
          [title]="s.label + ' · ' + s.target + ' · ' + s.durationLabel"
        ></div>
      }
    </div>
  `,
})
export class IntervalBarComponent {
  readonly intervals = input.required<WorkoutInterval[]>();
  /** Highlight a single interval (rest dim). For live workout mode. */
  readonly activeIndex = input<number | null>(null);

  protected readonly segments = computed<Segment[]>(() => {
    const arr = this.intervals();
    const total = totalSeconds(arr);
    if (total === 0) return [];
    return arr.map((iv) => ({
      index: iv.index,
      label: iv.label,
      target: formatTarget(iv.target),
      durationSec: iv.durationSec,
      durationLabel: formatDuration(iv.durationSec),
      color: targetColor(iv.target),
      widthPct: (iv.durationSec / total) * 100,
    }));
  });
}
