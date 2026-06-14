import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

/**
 * Full-circle progress ring speedometer. Matches the VeloDash dashboard mock:
 * thin track at white/10, progress arc in electric lime with a soft glow, big
 * Sora numeral in the middle, "CURRENT SPEED" caps label above and "KM/H"
 * caps below, lime kinetic accent bar at the bottom.
 *
 * Pairs nicely with the 1-column "big" layout — set as your only tile and the
 * ring fills the full width.
 */
@Component({
  selector: 'mobile-speed-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="rounded-xl velo-glass p-6 flex flex-col items-center">
      <div class="relative w-full max-w-[280px] aspect-square flex items-center justify-center">
        <svg
          class="absolute inset-0 w-full h-full -rotate-90 velo-glow-lime"
          viewBox="0 0 100 100"
        >
          <!-- Track -->
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            stroke-width="4"
          />
          <!-- Progress -->
          <circle
            cx="50"
            cy="50"
            r="46"
            fill="none"
            stroke="#c3f400"
            stroke-width="4"
            stroke-linecap="round"
            [attr.stroke-dasharray]="progressDashArray()"
          />
        </svg>

        <div class="text-center z-10">
          <span class="font-grotesk text-label-caps text-on-surface-variant uppercase block mb-1">
            Current Speed
          </span>
          <div class="flex items-baseline justify-center">
            <span class="font-sora text-metric-xl text-velo-lime leading-none">
              {{ speedKmh() | number: '1.1-1' }}
            </span>
            <span class="font-grotesk text-label-caps text-on-surface-variant uppercase ml-2">
              km/h
            </span>
          </div>
        </div>

        <!-- Kinetic accent bar at the bottom of the ring. -->
        <div
          class="absolute -bottom-2 w-16 h-1 bg-velo-lime rounded-full"
          style="box-shadow: 0 0 10px rgba(195, 244, 0, 0.8);"
        ></div>
      </div>
    </div>
  `,
})
export class SpeedRingComponent {
  readonly speedKmh = input.required<number>();
  readonly maxKmh = input<number>(60);

  // Circumference for r=46 (≈ 289.03). Used to build a stroke-dasharray that
  // shows `progress * circumference` as filled and the rest as gap.
  private readonly CIRC = 2 * Math.PI * 46;

  private readonly progress = computed(() => {
    const v = Math.max(0, Math.min(this.maxKmh(), this.speedKmh()));
    return v / this.maxKmh();
  });

  protected readonly progressDashArray = computed(() => {
    const filled = this.progress() * this.CIRC;
    return `${filled.toFixed(2)} ${(this.CIRC - filled).toFixed(2)}`;
  });
}
