import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

/**
 * Full-screen 3-2-1 countdown shown before a workout-mode recording
 * actually starts. The number itself pulses each second; a small "Cancel"
 * X in the top-right backs out without starting the ride.
 *
 * Parent owns the timer (the recording service shouldn't tick during a
 * countdown — elapsedSec for the first interval starts at zero). This
 * component is purely visual + emits a `cancel` event.
 */
@Component({
  selector: 'mobile-countdown-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center">
      <button
        type="button"
        (click)="cancel.emit()"
        class="absolute top-safe-6 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-on-surface flex items-center justify-center"
        aria-label="Cancel countdown"
      >
        <span class="material-symbols-outlined">close</span>
      </button>

      @if (label(); as l) {
        <div class="text-velo-lime font-sora text-[14rem] leading-none tabular-nums countdown-pulse"
             [attr.data-tick]="value()">{{ l }}</div>
      }

      @if (title(); as t) {
        <div class="mt-8 font-sora text-on-surface text-xl text-center max-w-xs px-4 truncate">
          {{ t }}
        </div>
      }
      <div class="mt-2 text-on-surface-variant text-sm font-grotesk uppercase tracking-wider text-xs">
        Get ready
      </div>
    </div>
  `,
  styles: [`
    /* Pulse animation per tick — bumps the data-tick attribute to retrigger */
    .countdown-pulse {
      animation: countdown-pop 0.9s cubic-bezier(0.18, 1.32, 0.36, 1) both;
    }
    @keyframes countdown-pop {
      0%   { transform: scale(0.4); opacity: 0; }
      35%  { transform: scale(1.15); opacity: 1; }
      80%  { transform: scale(1); opacity: 1; }
      100% { transform: scale(1); opacity: 0.85; }
    }
  `],
})
export class CountdownOverlayComponent {
  /** Current tick value: 3, 2, 1, or 0 (rendered as GO!). */
  readonly value = input.required<number>();
  /** Workout title, shown small below the number. */
  readonly title = input<string | null>(null);

  readonly cancel = output<void>();

  protected readonly label = computed(() => {
    const v = this.value();
    if (v <= 0) return 'GO';
    return String(v);
  });
}
