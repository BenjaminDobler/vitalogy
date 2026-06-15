import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { HrZoneBreakdown } from 'training-metrics';

interface ZoneSpec {
  key: keyof HrZoneBreakdown;
  label: string;
  range: string;
  color: string;
}

const ZONES: ZoneSpec[] = [
  { key: 'z1Sec', label: 'Z1', range: '50–60%', color: '#3d4a1a' },
  { key: 'z2Sec', label: 'Z2', range: '60–70%', color: '#5e7a26' },
  { key: 'z3Sec', label: 'Z3', range: '70–80%', color: '#9ec635' },
  { key: 'z4Sec', label: 'Z4', range: '80–90%', color: '#fb923c' },
  { key: 'z5Sec', label: 'Z5', range: '90–100%', color: '#ef4444' },
];

/**
 * Stacked horizontal bar showing time spent in each HR zone, plus a legend
 * with absolute time + percentage per zone. Below-Z1 samples (recovery
 * spin-out, stopped lights, etc.) are excluded from the bar but reported
 * in the totals.
 */
@Component({
  selector: 'lib-hr-zones-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (breakdown(); as b) {
      <div class="velo-glass rounded-xl p-5">
        <div class="flex items-baseline justify-between mb-3">
          <div class="font-grotesk text-label-caps text-on-surface uppercase">
            HR zones
          </div>
          <div class="text-xs text-on-surface-variant">
            % of max heart rate
          </div>
        </div>
        <div class="flex h-3 w-full rounded-full overflow-hidden bg-white/5">
          @for (z of segments(); track z.key) {
            <div
              [style.width.%]="z.pct"
              [style.background-color]="z.color"
              [title]="z.label + ' · ' + formatTime(z.seconds)"
            ></div>
          }
        </div>
        <div class="grid grid-cols-5 gap-2 mt-3 text-xs">
          @for (z of segments(); track z.key) {
            <div class="bg-white/5 rounded px-2 py-1.5">
              <div class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-sm" [style.background-color]="z.color"></span>
                <span class="font-grotesk uppercase tracking-wider text-[10px]">{{ z.label }}</span>
              </div>
              <div class="text-[10px] text-on-surface-variant tabular-nums">{{ z.range }}</div>
              <div class="font-sora text-on-surface tabular-nums">{{ formatTime(z.seconds) }}</div>
              <div class="text-[10px] text-on-surface-variant tabular-nums">
                {{ z.pct.toFixed(0) }}%
              </div>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class HrZonesChartComponent {
  readonly breakdown = input.required<HrZoneBreakdown | null>();

  protected readonly segments = computed(() => {
    const b = this.breakdown();
    if (!b) return [];
    // % is over the time spent IN zones (Z1..Z5), not total — that way the
    // bar always fills regardless of how much below-Z1 time the ride had.
    const inZoneTotal =
      b.z1Sec + b.z2Sec + b.z3Sec + b.z4Sec + b.z5Sec;
    if (inZoneTotal <= 0) return [];
    return ZONES.map((z) => ({
      key: z.key,
      label: z.label,
      range: z.range,
      color: z.color,
      seconds: b[z.key],
      pct: (b[z.key] / inZoneTotal) * 100,
    }));
  });

  protected formatTime(seconds: number): string {
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h${m.toString().padStart(2, '0')}`;
    if (m > 0) return `${m}m${sec.toString().padStart(2, '0')}s`;
    return `${sec}s`;
  }
}
