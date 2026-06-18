import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import {
  compassCardinal,
  describeWeather,
  type WidgetType,
} from 'data-models';
import type { RideWidgetData } from './ride-widget.types';

/**
 * Single source-of-truth widget renderer used by:
 *   - mobile feature-record's carousel (WidgetRendererComponent
 *     wraps this with live signals from RecordingService /
 *     WeatherService / BleManager)
 *   - web ride-views editor (WidgetPreviewComponent wraps this with
 *     a constant SAMPLE_DATA so the canvas shows realistic values
 *     without needing the mobile-only services)
 *
 * Pure: takes everything via inputs, injects nothing. That's what
 * lets the same component render in both contexts.
 *
 * Sizing: the host element is a CSS container (`container-type:
 * inline-size`) so every font / padding / gap inside scales via
 * `cqi`-based clamp(). A 1×1 cell on a 360 px phone reads the same
 * way a 3×3 cell on the editor canvas does, just bigger — no class
 * swap, no @media queries.
 */
@Component({
  selector: 'lib-ride-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full h-full ride-widget-host' },
  template: `
    @switch (widget()) {
      @case ('speed-gauge') {
        <div class="velo-glass rounded-xl h-full w-full p-[6cqi] flex flex-col items-center justify-center">
          <div class="relative w-[60cqi] h-[60cqi] max-w-full rounded-full border-[6cqi] border-velo-lime/30 flex items-center justify-center">
            <div class="absolute inset-0 rounded-full border-[6cqi] border-velo-lime border-r-transparent border-b-transparent rotate-[60deg]"></div>
            <div class="font-sora text-velo-lime tabular-nums" style="font-size: clamp(0.9rem, 14cqi, 4rem);">
              {{ formatNum(speedKmh(), 0) }}
            </div>
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
              [attr.stroke-dasharray]="speedRingDash()" stroke-linecap="round" transform="rotate(-90 50 50)" />
            <text x="50" y="50" text-anchor="middle" dominant-baseline="middle" fill="#c3f400" font-family="Sora" font-size="20" font-weight="600">
              {{ formatNum(speedKmh(), 1) }}
            </text>
            <text x="50" y="68" text-anchor="middle" fill="rgba(229,226,225,0.6)" font-family="Inter" font-size="7" letter-spacing="1">KM/H</text>
          </svg>
        </div>
      }
      @case ('map') {
        <!-- TODO: live-recording map widget. For now a placeholder so
             custom layouts that include "map" still render meaningfully. -->
        <div class="velo-glass rounded-xl h-full w-full overflow-hidden relative">
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
            <span>{{ formatNum(data().distanceKm, 1) }} km</span>
            <span>↑ 245 m</span>
          </div>
        </div>
      }
      @case ('weather') {
        @if (data().weather; as w) {
          <div class="velo-glass rounded-xl h-full w-full p-[5cqi] flex flex-col justify-center font-grotesk">
            <div class="flex items-center gap-[3cqi]">
              <span style="font-size: clamp(1rem, 10cqi, 2.5rem);">{{ weatherEmoji(w.weatherCode) }}</span>
              <span class="font-sora text-velo-lime tabular-nums" style="font-size: clamp(0.9rem, 11cqi, 2.5rem);">
                {{ w.tempC != null ? (formatNum(w.tempC, 0) + '°') : '—' }}
              </span>
            </div>
            <div class="text-on-surface-variant uppercase tracking-wider mt-[2cqi]" style="font-size: clamp(0.5rem, 3cqi, 0.8rem);">
              {{ weatherLabel(w.weatherCode) }}
            </div>
            <div class="text-on-surface tabular-nums mt-[3cqi]" style="font-size: clamp(0.55rem, 3.5cqi, 0.95rem);">
              {{ w.windSpeedKmh != null ? formatNum(w.windSpeedKmh, 0) + ' km/h' : '—' }}
              <span class="text-on-surface-variant uppercase ml-1" style="font-size: 0.8em;">
                {{ windCardinal(w.windDirectionDeg) }}
              </span>
            </div>
          </div>
        } @else {
          <div class="velo-glass rounded-xl h-full w-full flex items-center justify-center text-on-surface-variant font-grotesk uppercase tracking-wider" style="font-size: clamp(0.55rem, 3cqi, 0.85rem);">
            Weather pending
          </div>
        }
      }
      @case ('workout-coach') {
        @if (data().workoutContext; as c) {
          <div class="rounded-xl h-full w-full p-[4cqi] border-2 border-velo-lime bg-velo-lime/15 flex flex-col">
            <div class="flex items-baseline justify-between mb-[1.5cqi]">
              <span class="font-grotesk text-on-surface-variant uppercase tracking-wider" style="font-size: clamp(0.5rem, 2.5cqi, 0.75rem);">
                Interval {{ c.intervalIndex + 1 }} / {{ c.workout.intervals.length }}
              </span>
              <span class="font-sora text-velo-lime tabular-nums" style="font-size: clamp(0.9rem, 8cqi, 2rem);">
                {{ formatMmss(c.intervalRemainingSec) }}
              </span>
            </div>
            <div class="flex items-baseline justify-between gap-2 mb-[3cqi]">
              <div class="font-sora text-on-surface truncate" style="font-size: clamp(0.7rem, 5cqi, 1.25rem);">
                {{ c.intervalLabel }}
              </div>
              <div class="font-grotesk text-on-surface-variant uppercase" style="font-size: clamp(0.5rem, 2.5cqi, 0.75rem);">
                {{ c.target.label }}
              </div>
            </div>
            <div class="flex items-end justify-between mt-auto">
              <div class="font-sora tabular-nums text-velo-lime leading-none" style="font-size: clamp(1.4rem, 14cqi, 4.5rem);">
                {{ c.currentValue != null ? formatNum(c.currentValue, 0) : '—' }}
              </div>
              <span class="font-grotesk uppercase px-[2cqi] py-[1cqi] rounded-full" style="font-size: clamp(0.5rem, 2.5cqi, 0.8rem);"
                [class.bg-velo-lime]="c.status === 'in'"
                [class.text-velo-on-lime]="c.status === 'in'"
                [class.bg-white\\/15]="c.status !== 'in'"
                [class.text-on-surface]="c.status !== 'in'"
              >
                {{ statusLabel(c.status) }}
              </span>
            </div>
          </div>
        } @else {
          <div class="velo-glass rounded-xl h-full w-full flex flex-col items-center justify-center text-center px-[6cqi]">
            <span class="font-grotesk text-on-surface-variant uppercase tracking-wider" style="font-size: clamp(0.55rem, 3cqi, 0.85rem);">
              No workout
            </span>
          </div>
        }
      }
      @default {
        <div class="velo-glass rounded-xl h-full w-full p-[6cqi] flex flex-col items-start justify-center">
          <div class="font-grotesk text-on-surface-variant uppercase tracking-wider mb-[3cqi] flex items-center gap-[1cqi]" style="font-size: clamp(0.5rem, 3cqi, 0.85rem);">
            {{ tileLabel() }}
            @if (sensorMissing()) {
              <span class="text-amber-400" style="font-size: 1em;" aria-label="Sensor not connected">⊘</span>
            }
          </div>
          @if (sensorMissing()) {
            <span class="font-grotesk text-amber-300/80 uppercase tracking-wider" style="font-size: clamp(0.55rem, 3.2cqi, 0.85rem);">
              No sensor
            </span>
          } @else {
            <div class="flex items-baseline gap-[1.5cqi]">
              <span class="font-sora tabular-nums leading-none text-velo-lime" style="font-size: clamp(1.5rem, 22cqi, 6rem);">
                {{ tileValue() }}
              </span>
              @if (tileUnit()) {
                <span class="font-grotesk text-on-surface-variant uppercase" style="font-size: clamp(0.5rem, 3cqi, 0.85rem);">
                  {{ tileUnit() }}
                </span>
              }
            </div>
          }
        </div>
      }
    }
  `,
  styles: [
    `
      /* CSS containment context so descendants can use cqi/cqh units
         to size themselves against THIS widget's cell, not the page. */
      :host {
        container-type: inline-size;
      }
    `,
  ],
})
export class RideWidgetComponent {
  readonly widget = input.required<WidgetType>();
  readonly data = input.required<RideWidgetData>();

  protected readonly speedKmh = computed(() => this.data().speedKmh);

  protected readonly tileLabel = computed(() => LABELS[this.widget()] ?? '');
  protected readonly tileUnit = computed(() => UNITS[this.widget()] ?? '');
  protected readonly tileValue = computed(() => {
    const d = this.data();
    switch (this.widget()) {
      case 'hr':
        return d.hr != null ? d.hr.toString() : '—';
      case 'cadence':
        return this.formatNum(d.cadence, 0);
      case 'speed':
        return this.formatNum(d.speedKmh, 1);
      case 'power':
        return this.formatNum(d.power, 0);
      case 'distance':
        return d.distanceKm.toFixed(2);
      case 'avg-hr':
        return this.formatNum(d.avgHr, 0);
      case 'avg-speed':
        return this.formatNum(d.avgSpeedKmh, 1);
      case 'lap-time':
        return formatDuration(d.lapDurationSec);
      case 'total-time':
        return formatDuration(d.totalDurationSec);
      default:
        return '';
    }
  });

  protected readonly sensorMissing = computed(() => {
    const missing = this.data().missingSensors;
    switch (this.widget()) {
      case 'hr':
      case 'avg-hr':
        return missing.includes('HRM');
      case 'cadence':
        return missing.includes('CSC');
      case 'power':
        return missing.includes('POWER');
      default:
        return false;
    }
  });

  /** Stroke-dasharray for the speed-ring progress arc. r=42 ⇒ circumference 264. */
  protected readonly speedRingDash = computed(() => {
    const kmh = this.data().speedKmh ?? 0;
    const frac = Math.min(1, Math.max(0, kmh / 60));
    const arc = (264 * frac).toFixed(1);
    return `${arc} 264`;
  });

  protected formatNum(v: number | null | undefined, digits: number): string {
    return v != null ? v.toFixed(digits) : '—';
  }

  protected formatMmss(sec: number): string {
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  }

  protected weatherEmoji(code: number | null | undefined): string {
    return describeWeather(code ?? 0).emoji;
  }
  protected weatherLabel(code: number | null | undefined): string {
    return describeWeather(code ?? 0).label;
  }
  protected windCardinal(deg: number | null | undefined): string {
    return deg == null ? '' : compassCardinal(deg);
  }
  protected statusLabel(status: 'in' | 'below' | 'above' | 'unknown'): string {
    switch (status) {
      case 'in': return 'In zone';
      case 'below': return 'Push harder';
      case 'above': return 'Ease off';
      case 'unknown': return 'Waiting…';
    }
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

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}
