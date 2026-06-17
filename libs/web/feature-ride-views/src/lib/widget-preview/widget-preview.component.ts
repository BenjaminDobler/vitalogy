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
 * The host is a CSS container (`container-type: inline-size`) so every
 * font size inside scales with the cell width via `cqi` units —
 * resizing the cell on the canvas grows the value text without
 * needing to swap classes or re-render. The big number uses a clamp
 * that hits roughly 1/3 of the cell width, mirroring what the mobile
 * tile layout does at runtime.
 *
 * Instantiated dynamically by RideViewEditorComponent via
 * `createComponent()` and attached into gridstack-managed DOM.
 */
@Component({
  selector: 'lib-widget-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full h-full widget-preview-host' },
  template: `
    @switch (widget()) {
      @case ('speed-gauge') {
        <div class="velo-glass rounded-xl h-full w-full p-[6cqi] flex flex-col items-center justify-center">
          <div class="relative w-[60cqi] h-[60cqi] max-w-full rounded-full border-[6cqi] border-velo-lime/30 flex items-center justify-center">
            <div class="absolute inset-0 rounded-full border-[6cqi] border-velo-lime border-r-transparent border-b-transparent rotate-[60deg]"></div>
            <div class="font-sora text-velo-lime tabular-nums" style="font-size: clamp(0.9rem, 14cqi, 4rem);">28</div>
          </div>
          <div class="font-grotesk text-on-surface-variant uppercase tracking-wider mt-[3cqi]" style="font-size: clamp(0.5rem, 3cqi, 0.85rem);">
            km/h
          </div>
        </div>
      }
      @case ('speed-ring') {
        <div class="velo-glass rounded-xl h-full w-full p-[5cqi] flex items-center justify-center">
          <svg viewBox="0 0 100 100" class="w-full h-full">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(195,244,0,0.15)" stroke-width="8" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#c3f400" stroke-width="8"
              stroke-dasharray="158 264" stroke-linecap="round" transform="rotate(-90 50 50)" />
            <text x="50" y="50" text-anchor="middle" dominant-baseline="middle" fill="#c3f400" font-family="Sora" font-size="20" font-weight="600">28.4</text>
            <text x="50" y="68" text-anchor="middle" fill="rgba(229,226,225,0.6)" font-family="Inter" font-size="7" letter-spacing="1">KM/H</text>
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
          <div class="absolute bottom-[3cqi] left-[3cqi] right-[3cqi] flex items-center justify-between font-grotesk uppercase text-on-surface-variant" style="font-size: clamp(0.55rem, 3cqi, 0.85rem);">
            <span>12.4 km</span>
            <span>↑ 245 m</span>
          </div>
        </div>
      }
      @case ('weather') {
        <div class="velo-glass rounded-xl h-full w-full p-[5cqi] flex flex-col justify-center font-grotesk">
          <div class="flex items-center gap-[3cqi]">
            <span style="font-size: clamp(1rem, 10cqi, 2.5rem);">⛅</span>
            <span class="font-sora text-velo-lime tabular-nums" style="font-size: clamp(0.9rem, 11cqi, 2.5rem);">18°</span>
          </div>
          <div class="text-on-surface-variant uppercase tracking-wider mt-[2cqi]" style="font-size: clamp(0.5rem, 3cqi, 0.8rem);">
            Partly cloudy
          </div>
          <div class="text-on-surface tabular-nums mt-[3cqi]" style="font-size: clamp(0.55rem, 3.5cqi, 0.95rem);">
            12 km/h
            <span class="text-on-surface-variant uppercase ml-1" style="font-size: 0.8em;">SW</span>
          </div>
        </div>
      }
      @case ('workout-coach') {
        <div class="rounded-xl h-full w-full p-[4cqi] border-2 border-velo-lime bg-velo-lime/15 flex flex-col">
          <div class="flex items-baseline justify-between mb-[1.5cqi]">
            <span class="font-grotesk text-on-surface-variant uppercase tracking-wider" style="font-size: clamp(0.5rem, 2.5cqi, 0.75rem);">
              Interval 2 / 6
            </span>
            <span class="font-sora text-velo-lime tabular-nums" style="font-size: clamp(0.9rem, 8cqi, 2rem);">4:32</span>
          </div>
          <div class="flex items-baseline justify-between gap-2 mb-[3cqi]">
            <div class="font-sora text-on-surface truncate" style="font-size: clamp(0.7rem, 5cqi, 1.25rem);">Threshold 3'</div>
            <div class="font-grotesk text-on-surface-variant uppercase" style="font-size: clamp(0.5rem, 2.5cqi, 0.75rem);">Z3-Z4</div>
          </div>
          <div class="flex items-end justify-between mt-auto">
            <div class="font-sora tabular-nums text-velo-lime leading-none" style="font-size: clamp(1.4rem, 14cqi, 4.5rem);">152</div>
            <span class="font-grotesk uppercase px-[2cqi] py-[1cqi] rounded-full bg-velo-lime text-velo-on-lime" style="font-size: clamp(0.5rem, 2.5cqi, 0.8rem);">
              In zone
            </span>
          </div>
        </div>
      }
      @default {
        <div class="velo-glass rounded-xl h-full w-full p-[6cqi] flex flex-col items-start justify-center">
          <div class="font-grotesk text-on-surface-variant uppercase tracking-wider mb-[3cqi]" style="font-size: clamp(0.5rem, 3cqi, 0.85rem);">
            {{ label() }}
          </div>
          <div class="flex items-baseline gap-[1.5cqi]">
            <span class="font-sora tabular-nums leading-none text-velo-lime" style="font-size: clamp(1.5rem, 22cqi, 6rem);">
              {{ value() }}
            </span>
            @if (unit()) {
              <span class="font-grotesk text-on-surface-variant uppercase" style="font-size: clamp(0.5rem, 3cqi, 0.85rem);">
                {{ unit() }}
              </span>
            }
          </div>
        </div>
      }
    }
  `,
  styles: [
    `
      /* Make the host a CSS containment context so descendants can use
         cqi/cqh units to size themselves relative to the cell — that's
         the whole point of this preview being rebuilt with container
         queries instead of fixed Tailwind text-* sizes. */
      :host {
        container-type: inline-size;
      }
    `,
  ],
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
