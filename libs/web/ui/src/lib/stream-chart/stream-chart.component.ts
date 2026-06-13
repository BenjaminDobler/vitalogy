import { Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

/**
 * Lightweight line chart for time-series stream data.
 * No dependencies — just SVG. Downsamples to ~500 points for perf.
 *
 * Pass numeric data, a label, a color, and an optional unit suffix.
 * The chart auto-computes min/max/avg and shows them in the header.
 */
@Component({
  selector: 'ui-stream-chart',
  imports: [DecimalPipe],
  template: `
    <div class="rounded-lg border border-slate-200 bg-white p-4">
      <div class="flex items-baseline justify-between mb-3 gap-4 flex-wrap">
        <h3 class="font-medium text-sm" [style.color]="color()">{{ label() }}</h3>
        <div class="text-xs text-slate-500 tabular-nums flex gap-3">
          <span>
            avg
            <strong class="text-slate-800">
              {{ stats().avg | number: precision() }}
            </strong>{{ unit() }}
          </span>
          <span>
            min
            <strong class="text-slate-800">
              {{ stats().min | number: precision() }}
            </strong>{{ unit() }}
          </span>
          <span>
            max
            <strong class="text-slate-800">
              {{ stats().max | number: precision() }}
            </strong>{{ unit() }}
          </span>
        </div>
      </div>
      <svg
        viewBox="0 0 1000 200"
        preserveAspectRatio="none"
        class="w-full h-28"
      >
        <!-- Faint horizontal guideline at the average. -->
        <line
          [attr.y1]="avgY()"
          [attr.y2]="avgY()"
          x1="0"
          x2="1000"
          stroke="#cbd5e1"
          stroke-width="1"
          stroke-dasharray="3 4"
          vector-effect="non-scaling-stroke"
        />
        <!-- Soft area fill under the line. -->
        <path
          [attr.d]="areaPath()"
          [attr.fill]="color()"
          fill-opacity="0.08"
        />
        <!-- The line itself. -->
        <polyline
          [attr.points]="linePoints()"
          fill="none"
          [attr.stroke]="color()"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    </div>
  `,
})
export class StreamChartComponent {
  readonly data = input.required<number[]>();
  readonly label = input.required<string>();
  readonly color = input<string>('#0f172a');
  readonly unit = input<string>('');
  /** Number of decimals to show in avg/min/max badges. Default 0. */
  readonly precision = input<string>('1.0-0');

  protected readonly stats = computed(() => {
    const arr = this.data();
    if (arr.length === 0) return { min: 0, max: 0, avg: 0 };
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (const v of arr) {
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    return { min, max, avg: sum / arr.length };
  });

  /** Downsampled, padded data ready for plotting (~500 points). */
  private readonly samples = computed(() => {
    const arr = this.data();
    if (arr.length === 0) return [] as number[];
    const target = 500;
    if (arr.length <= target) return arr;
    const step = arr.length / target;
    const out: number[] = [];
    for (let i = 0; i < target; i++) {
      out.push(arr[Math.floor(i * step)]);
    }
    return out;
  });

  /** y coordinate (in viewBox units) of the average line. */
  protected readonly avgY = computed(() => {
    const { min, max, avg } = this.stats();
    const range = max - min || 1;
    return 200 - ((avg - min) / range) * 180 - 10; // 10px padding top/bottom
  });

  protected readonly linePoints = computed(() => {
    const samples = this.samples();
    if (samples.length === 0) return '';
    const { min, max } = this.stats();
    const range = max - min || 1;
    const W = 1000;
    const denom = samples.length - 1 || 1;
    const pts: string[] = [];
    for (let i = 0; i < samples.length; i++) {
      const x = (i / denom) * W;
      const y = 200 - ((samples[i] - min) / range) * 180 - 10;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  });

  protected readonly areaPath = computed(() => {
    const points = this.linePoints();
    if (!points) return '';
    return `M 0,200 L ${points} L 1000,200 Z`;
  });
}
