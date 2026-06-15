import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { PowerCurvePoint } from '../training-metrics.js';

/**
 * SVG line chart of best-mean-max power across canonical durations.
 *
 * X axis is log-scale because the interesting durations span 4 orders of
 * magnitude (1s → 3600s). Y axis is linear watts. No external chart lib —
 * the data is at most ~11 points and shapes are trivial.
 */
@Component({
  selector: 'lib-power-curve-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    @if (points().length > 0) {
      <div class="velo-glass rounded-xl p-5">
        <div class="flex items-baseline justify-between mb-2">
          <div class="font-grotesk text-label-caps text-on-surface uppercase">
            Power curve
          </div>
          <div class="text-xs text-on-surface-variant">
            best mean-max watts × duration
          </div>
        </div>
        <svg
          [attr.viewBox]="'0 0 ' + W + ' ' + H"
          class="w-full"
          [attr.aria-label]="'Power curve chart'"
        >
          <!-- Y gridlines + labels -->
          @for (g of yGridLines(); track g.value) {
            <line
              [attr.x1]="padLeft"
              [attr.x2]="W - padRight"
              [attr.y1]="g.y"
              [attr.y2]="g.y"
              stroke="rgba(255,255,255,0.06)"
              stroke-width="1"
            />
            <text
              [attr.x]="padLeft - 6"
              [attr.y]="g.y + 3"
              text-anchor="end"
              fill="rgba(196,201,172,0.7)"
              font-size="10"
              font-family="ui-monospace, SFMono-Regular, monospace"
            >{{ g.value }}</text>
          }

          <!-- X axis tick labels -->
          @for (t of xTicks(); track t.sec) {
            <text
              [attr.x]="t.x"
              [attr.y]="H - 6"
              text-anchor="middle"
              fill="rgba(196,201,172,0.7)"
              font-size="10"
              font-family="ui-monospace, SFMono-Regular, monospace"
            >{{ t.label }}</text>
          }

          <!-- Curve -->
          <polyline
            [attr.points]="polyline()"
            fill="none"
            stroke="#c3f400"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />

          <!-- Sample dots + watt labels -->
          @for (p of plotPoints(); track p.durationSec) {
            <circle
              [attr.cx]="p.x"
              [attr.cy]="p.y"
              r="3"
              fill="#c3f400"
            />
          }
        </svg>
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3 text-xs tabular-nums">
          @for (p of points(); track p.durationSec) {
            <div class="bg-white/5 rounded px-2 py-1.5">
              <div class="text-[10px] text-on-surface-variant uppercase tracking-wider">
                {{ formatDuration(p.durationSec) }}
              </div>
              <div class="text-on-surface font-sora">
                {{ p.watts | number: '1.0-0' }} <span class="text-on-surface-variant text-[10px]">W</span>
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class PowerCurveChartComponent {
  readonly points = input.required<PowerCurvePoint[]>();

  // Viewport in SVG user units. width/height are picked to look fine
  // at ~600px container width; the wrapper scales it via width:100%.
  protected readonly W = 600;
  protected readonly H = 220;
  protected readonly padLeft = 40;
  protected readonly padRight = 12;
  protected readonly padTop = 12;
  protected readonly padBottom = 24;

  private readonly logMin = computed(() => {
    const ps = this.points();
    if (ps.length === 0) return 0;
    return Math.log10(ps[0].durationSec);
  });
  private readonly logMax = computed(() => {
    const ps = this.points();
    if (ps.length === 0) return 1;
    return Math.log10(ps[ps.length - 1].durationSec);
  });
  private readonly wattMax = computed(() => {
    const ps = this.points();
    if (ps.length === 0) return 100;
    const m = Math.max(...ps.map((p) => p.watts));
    // Round up to nice number for the axis.
    if (m <= 100) return 120;
    if (m <= 300) return Math.ceil(m / 50) * 50;
    return Math.ceil(m / 100) * 100;
  });

  protected readonly plotPoints = computed(() =>
    this.points().map((p) => ({
      durationSec: p.durationSec,
      watts: p.watts,
      x: this.xForSec(p.durationSec),
      y: this.yForWatts(p.watts),
    })),
  );

  protected readonly polyline = computed(() =>
    this.plotPoints().map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
  );

  protected readonly xTicks = computed(() => {
    // Show only ticks within the range of available durations
    const all = [
      { sec: 1, label: '1s' },
      { sec: 5, label: '5s' },
      { sec: 30, label: '30s' },
      { sec: 60, label: '1m' },
      { sec: 300, label: '5m' },
      { sec: 1200, label: '20m' },
      { sec: 3600, label: '1h' },
    ];
    const ps = this.points();
    if (ps.length === 0) return [];
    const min = ps[0].durationSec;
    const max = ps[ps.length - 1].durationSec;
    return all
      .filter((t) => t.sec >= min && t.sec <= max)
      .map((t) => ({ ...t, x: this.xForSec(t.sec) }));
  });

  protected readonly yGridLines = computed(() => {
    const max = this.wattMax();
    const step = max <= 200 ? 50 : max <= 500 ? 100 : 200;
    const out: { value: number; y: number }[] = [];
    for (let v = 0; v <= max; v += step) {
      out.push({ value: v, y: this.yForWatts(v) });
    }
    return out;
  });

  private xForSec(sec: number): number {
    const lo = this.logMin();
    const hi = this.logMax();
    const width = this.W - this.padLeft - this.padRight;
    if (hi === lo) return this.padLeft + width / 2;
    const t = (Math.log10(sec) - lo) / (hi - lo);
    return this.padLeft + t * width;
  }

  private yForWatts(w: number): number {
    const max = this.wattMax();
    const height = this.H - this.padTop - this.padBottom;
    return this.padTop + (1 - w / max) * height;
  }

  protected formatDuration(sec: number): string {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.round(sec / 60)}m`;
    return `${Math.round(sec / 60)}m`;
  }
}
