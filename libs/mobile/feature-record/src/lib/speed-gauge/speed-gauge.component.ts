import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

/**
 * Analog-style speed tachometer rendered as inline SVG.
 *
 *   - 270° arc dial (-135°..+135° from straight up), 0..maxKmh range
 *   - Background arc + colored foreground arc that fills toward the current speed
 *   - Tick marks every 10 km/h, value labels every 20 km/h
 *   - White needle, big numeric value in the center
 *
 * Dependency-free (no chart libs) — uses standard SVG primitives so it scales
 * cleanly in both 2-column and 1-column layouts.
 */
@Component({
  selector: 'mobile-speed-gauge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="rounded-xl bg-slate-900 p-3 flex flex-col items-center">
      <svg viewBox="0 0 200 200" class="w-full max-w-[280px]">
        <!-- Background arc (full sweep). -->
        <path
          [attr.d]="bgArcPath()"
          stroke="rgb(30 41 59)"
          stroke-width="12"
          fill="none"
          stroke-linecap="round"
        />
        <!-- Foreground arc fills from start to current speed. -->
        <path
          [attr.d]="fgArcPath()"
          stroke="rgb(56 189 248)"
          stroke-width="12"
          fill="none"
          stroke-linecap="round"
        />

        <!-- Major tick marks. -->
        @for (t of ticks(); track t.value) {
          <line
            [attr.x1]="t.x1"
            [attr.y1]="t.y1"
            [attr.x2]="t.x2"
            [attr.y2]="t.y2"
            stroke="rgb(100 116 139)"
            stroke-width="1.5"
          />
          @if (t.label != null) {
            <text
              [attr.x]="t.lx"
              [attr.y]="t.ly"
              fill="rgb(148 163 184)"
              font-size="10"
              text-anchor="middle"
              dominant-baseline="middle"
              font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
            >{{ t.label }}</text>
          }
        }

        <!-- Needle. -->
        <line
          x1="100"
          y1="100"
          [attr.x2]="needleX()"
          [attr.y2]="needleY()"
          stroke="white"
          stroke-width="2.5"
          stroke-linecap="round"
        />
        <circle cx="100" cy="100" r="6" fill="rgb(15 23 42)" stroke="white" stroke-width="2" />

        <!-- Big numeric value. -->
        <text
          x="100"
          y="148"
          fill="white"
          font-size="34"
          font-weight="700"
          text-anchor="middle"
          font-family="ui-monospace, SFMono-Regular, Menlo, monospace"
        >{{ speedKmh() | number: '1.0-0' }}</text>
        <text
          x="100"
          y="170"
          fill="rgb(100 116 139)"
          font-size="11"
          text-anchor="middle"
          letter-spacing="0.05em"
        >km/h</text>
      </svg>
    </div>
  `,
})
export class SpeedGaugeComponent {
  readonly speedKmh = input.required<number>();
  readonly maxKmh = input<number>(60);

  // Dial geometry — 270° arc from 7 o'clock (225°) clockwise to 5 o'clock (135°).
  private readonly CENTER = { x: 100, y: 100 };
  private readonly RADIUS = 80;
  private readonly START_ANGLE = 225;
  private readonly END_ANGLE = 135 + 360; // i.e. 495 to make math monotonic
  private readonly SWEEP = this.END_ANGLE - this.START_ANGLE; // 270°

  private currentAngle = computed(() => {
    const v = Math.max(0, Math.min(this.maxKmh(), this.speedKmh()));
    return this.START_ANGLE + (v / this.maxKmh()) * this.SWEEP;
  });

  protected bgArcPath = computed(() =>
    arcPath(
      this.CENTER.x,
      this.CENTER.y,
      this.RADIUS,
      this.START_ANGLE,
      this.END_ANGLE,
    ),
  );

  protected fgArcPath = computed(() =>
    arcPath(
      this.CENTER.x,
      this.CENTER.y,
      this.RADIUS,
      this.START_ANGLE,
      this.currentAngle(),
    ),
  );

  protected needleX = computed(
    () =>
      this.CENTER.x +
      (this.RADIUS - 18) * Math.cos(degToRad(this.currentAngle() - 90)),
  );
  protected needleY = computed(
    () =>
      this.CENTER.y +
      (this.RADIUS - 18) * Math.sin(degToRad(this.currentAngle() - 90)),
  );

  protected ticks = computed(() => {
    const out: Array<{
      value: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      lx?: number;
      ly?: number;
      label?: string;
    }> = [];
    const step = 10;
    for (let v = 0; v <= this.maxKmh(); v += step) {
      const angle = this.START_ANGLE + (v / this.maxKmh()) * this.SWEEP;
      const inner = polar(this.CENTER, this.RADIUS - 14, angle);
      const outer = polar(this.CENTER, this.RADIUS - 4, angle);
      const tick: typeof out[number] = {
        value: v,
        x1: inner.x,
        y1: inner.y,
        x2: outer.x,
        y2: outer.y,
      };
      // Label every 20.
      if (v % 20 === 0) {
        const labelPos = polar(this.CENTER, this.RADIUS - 28, angle);
        tick.lx = labelPos.x;
        tick.ly = labelPos.y;
        tick.label = String(v);
      }
      out.push(tick);
    }
    return out;
  });
}

/** Build an SVG arc path between two angles (degrees), 0° = straight up. */
function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = polar({ x: cx, y: cy }, r, startDeg);
  const end = polar({ x: cx, y: cy }, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function polar(
  c: { x: number; y: number },
  r: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = degToRad(angleDeg - 90);
  return { x: c.x + r * Math.cos(rad), y: c.y + r * Math.sin(rad) };
}

function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}
