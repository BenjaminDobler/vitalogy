import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { WidgetType } from 'data-models';

/**
 * Editor-side preview of a single widget. Renders the same Tailwind
 * markup the mobile WidgetRendererComponent uses, but with hard-coded
 * sample values so it renders standalone — no RecordingService /
 * WeatherService injection needed.
 *
 * The values are chosen to read as a realistic mid-ride snapshot
 * (HR 142, cadence 86, speed 28.4 km/h…) so the rider can size the
 * tiles against what they'll actually see while pedaling.
 *
 * Instantiated dynamically by RideViewEditorComponent via
 * `createComponent()` and attached into gridstack-managed DOM; this
 * is why the host is a plain `<div class="w-full h-full">` (gridstack
 * controls positioning).
 */
@Component({
  selector: 'lib-widget-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full h-full' },
  template: `
    @switch (widget()) {
      @case ('speed-gauge') {
        <div class="velo-glass rounded-xl h-full w-full p-4 flex flex-col items-center justify-center">
          <div class="relative w-24 h-24 rounded-full border-4 border-velo-lime/30 flex items-center justify-center">
            <div class="absolute inset-0 rounded-full border-4 border-velo-lime border-r-transparent border-b-transparent rotate-[60deg]"></div>
            <div class="font-sora text-velo-lime text-2xl tabular-nums">28</div>
          </div>
          <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mt-2 text-[10px]">
            km/h
          </div>
        </div>
      }
      @case ('speed-ring') {
        <div class="velo-glass rounded-xl h-full w-full p-4 flex items-center justify-center">
          <svg viewBox="0 0 100 100" class="w-full h-full max-h-32">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(195,244,0,0.15)" stroke-width="8" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#c3f400" stroke-width="8"
              stroke-dasharray="158 264" stroke-linecap="round" transform="rotate(-90 50 50)" />
            <text x="50" y="48" text-anchor="middle" fill="#c3f400" font-family="Sora" font-size="20" font-weight="600">28.4</text>
            <text x="50" y="62" text-anchor="middle" fill="rgba(229,226,225,0.6)" font-family="Inter" font-size="8" letter-spacing="1">KM/H</text>
          </svg>
        </div>
      }
      @case ('map') {
        <div class="velo-glass rounded-xl h-full w-full overflow-hidden relative">
          <!-- Stylized OSM-ish background + lime route line. -->
          <div class="absolute inset-0" style="background:
            radial-gradient(circle at 30% 40%, rgba(195,244,0,0.05), transparent 50%),
            linear-gradient(135deg, #1f2820 0%, #15201a 60%, #0f0f0f 100%);"></div>
          <svg viewBox="0 0 200 100" class="absolute inset-0 w-full h-full" preserveAspectRatio="none">
            <path d="M10,85 Q40,30 75,55 T140,40 L185,15"
              stroke="#c3f400" stroke-width="2.5" fill="none" stroke-linecap="round" />
            <circle cx="10" cy="85" r="3" fill="#c3f400" />
            <circle cx="185" cy="15" r="3" fill="none" stroke="#c3f400" stroke-width="2" />
          </svg>
          <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between font-grotesk text-[10px] uppercase text-on-surface-variant">
            <span>12.4 km</span>
            <span>↑ 245 m</span>
          </div>
        </div>
      }
      @case ('weather') {
        <div class="velo-glass rounded-xl h-full w-full p-4 flex flex-col justify-center font-grotesk">
          <div class="flex items-center gap-2">
            <span class="text-2xl">⛅</span>
            <span class="font-sora text-velo-lime text-xl tabular-nums">18°</span>
          </div>
          <div class="text-[10px] text-on-surface-variant uppercase mt-1 tracking-wider">
            Partly cloudy
          </div>
          <div class="text-xs text-on-surface tabular-nums mt-2">
            12 km/h
            <span class="text-on-surface-variant text-[10px] uppercase ml-1">SW</span>
          </div>
        </div>
      }
      @case ('workout-coach') {
        <div class="rounded-xl h-full w-full p-3 border-2 border-velo-lime bg-velo-lime/15 flex flex-col">
          <div class="flex items-baseline justify-between mb-1">
            <span class="font-grotesk text-[10px] text-on-surface-variant uppercase tracking-wider">
              Interval 2 / 6
            </span>
            <span class="font-sora text-velo-lime text-xl tabular-nums">4:32</span>
          </div>
          <div class="flex items-baseline justify-between gap-2 mb-2">
            <div class="font-sora text-on-surface text-base truncate">Threshold 3'</div>
            <div class="font-grotesk text-on-surface-variant uppercase text-[10px]">Z3-Z4</div>
          </div>
          <div class="flex items-end justify-between mt-auto">
            <div class="font-sora tabular-nums text-3xl text-velo-lime leading-none">152</div>
            <span class="font-grotesk uppercase text-[10px] px-2 py-1 rounded-full bg-velo-lime text-velo-on-lime">
              In zone
            </span>
          </div>
        </div>
      }
      @default {
        <div class="velo-glass rounded-xl h-full w-full p-4 flex flex-col items-start justify-center">
          <div class="font-grotesk text-label-caps text-on-surface-variant uppercase text-[10px] tracking-wider mb-2">
            {{ label() }}
          </div>
          <div class="flex items-baseline gap-1">
            <span class="font-sora tabular-nums leading-none text-velo-lime text-3xl">
              {{ value() }}
            </span>
            @if (unit()) {
              <span class="font-grotesk text-on-surface-variant uppercase text-[10px]">
                {{ unit() }}
              </span>
            }
          </div>
        </div>
      }
    }
  `,
})
export class WidgetPreviewComponent {
  readonly widget = input.required<WidgetType>();

  protected label(): string {
    return LABELS[this.widget()] ?? this.widget();
  }
  protected unit(): string {
    return UNITS[this.widget()] ?? '';
  }
  protected value(): string {
    return VALUES[this.widget()] ?? '—';
  }
}

const LABELS: Partial<Record<WidgetType, string>> = {
  hr: 'Heart rate',
  cadence: 'Cadence',
  speed: 'Speed',
  power: 'Power',
  distance: 'Distance',
  'avg-hr': 'Avg HR',
  'avg-speed': 'Avg speed',
  'lap-time': 'Lap time',
  'total-time': 'Total time',
};

const UNITS: Partial<Record<WidgetType, string>> = {
  hr: 'bpm',
  cadence: 'rpm',
  speed: 'km/h',
  power: 'W',
  distance: 'km',
  'avg-hr': 'bpm',
  'avg-speed': 'km/h',
};

// Hard-coded sample values chosen to read as a realistic mid-ride
// snapshot. Kept inline (rather than randomized) so saved screenshots
// of the editor are diff-stable.
const VALUES: Partial<Record<WidgetType, string>> = {
  hr: '142',
  cadence: '86',
  speed: '28.4',
  power: '214',
  distance: '12.45',
  'avg-hr': '138',
  'avg-speed': '24.7',
  'lap-time': '3:42',
  'total-time': '1:24:35',
};
