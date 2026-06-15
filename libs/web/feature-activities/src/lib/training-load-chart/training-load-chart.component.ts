import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { DailyLoadPoint } from 'data-models';

interface Tick {
  x: number;
  label: string;
}

/**
 * Banister CTL/ATL chart over a multi-month window.
 *
 *   ▰ CTL — filled lime area (fitness, long-term)
 *   ● ATL — orange line (fatigue, short-term)
 *
 * X axis: month-start ticks. Y axis: implicit (max of either series). Daily
 * load itself is drawn as faint vertical bars in the background so high-
 * volume days stand out without dominating the trend lines.
 */
@Component({
  selector: 'lib-training-load-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (points().length > 0) {
      <svg
        [attr.viewBox]="'0 0 ' + W + ' ' + H"
        class="w-full"
        aria-label="Training load over time"
      >
        <!-- Daily load bars (background) -->
        @for (b of bars(); track b.x) {
          <rect
            [attr.x]="b.x"
            [attr.y]="b.y"
            [attr.width]="barWidth()"
            [attr.height]="b.h"
            fill="rgba(195,244,0,0.12)"
          />
        }

        <!-- Y gridlines + labels -->
        @for (g of yTicks(); track g.value) {
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

        <!-- X axis month labels -->
        @for (t of xTicks(); track t.x) {
          <text
            [attr.x]="t.x"
            [attr.y]="H - 6"
            text-anchor="middle"
            fill="rgba(196,201,172,0.7)"
            font-size="10"
            font-family="ui-monospace, SFMono-Regular, monospace"
          >{{ t.label }}</text>
        }

        <!-- CTL area (fitness) -->
        <polygon
          [attr.points]="ctlArea()"
          fill="rgba(195,244,0,0.18)"
          stroke="none"
        />
        <polyline
          [attr.points]="ctlLine()"
          fill="none"
          stroke="#c3f400"
          stroke-width="2"
        />

        <!-- ATL line (fatigue) -->
        <polyline
          [attr.points]="atlLine()"
          fill="none"
          stroke="#fb923c"
          stroke-width="1.5"
          stroke-dasharray="4 3"
        />

        <!-- Legend -->
        <g [attr.transform]="'translate(' + padLeft + ', ' + (padTop) + ')'">
          <rect x="0" y="0" width="10" height="10" fill="#c3f400" rx="1" />
          <text x="14" y="9" fill="rgba(196,201,172,0.9)" font-size="10" font-family="ui-sans-serif">
            Fitness (CTL · 42d)
          </text>
          <rect x="130" y="2" width="14" height="2" fill="#fb923c" />
          <text x="148" y="9" fill="rgba(196,201,172,0.9)" font-size="10" font-family="ui-sans-serif">
            Fatigue (ATL · 7d)
          </text>
        </g>
      </svg>
    }
  `,
})
export class TrainingLoadChartComponent {
  readonly points = input.required<DailyLoadPoint[]>();

  protected readonly W = 800;
  protected readonly H = 220;
  protected readonly padLeft = 36;
  protected readonly padRight = 12;
  protected readonly padTop = 24;
  protected readonly padBottom = 24;

  private readonly maxY = computed(() => {
    const ps = this.points();
    if (ps.length === 0) return 100;
    const peak = Math.max(
      ...ps.map((p) => Math.max(p.ctl, p.atl, p.load)),
      40,
    );
    if (peak <= 50) return 50;
    if (peak <= 100) return Math.ceil(peak / 25) * 25;
    return Math.ceil(peak / 50) * 50;
  });

  protected readonly yTicks = computed(() => {
    const max = this.maxY();
    const step = max <= 50 ? 10 : max <= 200 ? 25 : 50;
    const out: { value: number; y: number }[] = [];
    for (let v = 0; v <= max; v += step) {
      out.push({ value: v, y: this.yFor(v) });
    }
    return out;
  });

  protected readonly xTicks = computed<Tick[]>(() => {
    const ps = this.points();
    if (ps.length === 0) return [];
    const ticks: Tick[] = [];
    let lastMonth = -1;
    ps.forEach((p, i) => {
      const month = new Date(p.date + 'T00:00:00Z').getUTCMonth();
      if (month !== lastMonth) {
        ticks.push({
          x: this.xFor(i),
          label: new Date(p.date + 'T00:00:00Z').toLocaleDateString(undefined, {
            month: 'short',
          }),
        });
        lastMonth = month;
      }
    });
    return ticks;
  });

  protected readonly ctlLine = computed(() =>
    this.points()
      .map((p, i) => `${this.xFor(i).toFixed(1)},${this.yFor(p.ctl).toFixed(1)}`)
      .join(' '),
  );
  protected readonly atlLine = computed(() =>
    this.points()
      .map((p, i) => `${this.xFor(i).toFixed(1)},${this.yFor(p.atl).toFixed(1)}`)
      .join(' '),
  );

  /** CTL polyline closed back along the baseline so we can fill it. */
  protected readonly ctlArea = computed(() => {
    const ps = this.points();
    if (ps.length === 0) return '';
    const top = ps
      .map((p, i) => `${this.xFor(i).toFixed(1)},${this.yFor(p.ctl).toFixed(1)}`)
      .join(' ');
    const baselineY = this.yFor(0);
    const lastX = this.xFor(ps.length - 1).toFixed(1);
    const firstX = this.xFor(0).toFixed(1);
    return `${top} ${lastX},${baselineY.toFixed(1)} ${firstX},${baselineY.toFixed(1)}`;
  });

  protected readonly barWidth = computed(() => {
    const ps = this.points();
    const innerW = this.W - this.padLeft - this.padRight;
    return Math.max(1, (innerW / ps.length) * 0.6);
  });

  protected readonly bars = computed(() => {
    const ps = this.points();
    return ps
      .map((p, i) => {
        const baselineY = this.yFor(0);
        const y = this.yFor(p.load);
        return { x: this.xFor(i) - this.barWidth() / 2, y, h: baselineY - y };
      })
      .filter((b) => b.h > 0);
  });

  private xFor(i: number): number {
    const ps = this.points();
    const innerW = this.W - this.padLeft - this.padRight;
    if (ps.length <= 1) return this.padLeft;
    return this.padLeft + (i / (ps.length - 1)) * innerW;
  }

  private yFor(v: number): number {
    const innerH = this.H - this.padTop - this.padBottom;
    return this.padTop + (1 - v / this.maxY()) * innerH;
  }
}
