import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import type { WidgetType } from 'data-models';
import { RecordingService } from 'recording';
import { WeatherService } from 'weather';
import { compassCardinal, describeWeather } from 'data-models';
import { SpeedGaugeComponent } from '../speed-gauge/speed-gauge.component';
import { SpeedRingComponent } from '../speed-ring/speed-ring.component';
import { WorkoutOverlayComponent } from '../workout-overlay/workout-overlay.component';

/**
 * Renders a single widget from a user's custom ride view. Switches
 * on WidgetType and pulls live data straight from RecordingService /
 * WeatherService so the parent grid doesn't have to prop-drill the
 * full set of signals per cell.
 *
 * Sizing is dictated by the parent (CSS grid sets width/height of
 * the cell); the widget fills 100% of its slot. Font sizes scale via
 * Tailwind's container-aware classes — what fits in a 1×1 cell also
 * reads well in a 4×3 cell, just bigger.
 *
 * For the workout-coach widget we re-use the existing
 * WorkoutOverlayComponent in `compact` mode. Map is a placeholder
 * until a live-recording map component lands (see TODO).
 */
@Component({
  selector: 'mobile-widget-renderer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    SpeedGaugeComponent,
    SpeedRingComponent,
    WorkoutOverlayComponent,
  ],
  template: `
    @switch (widget()) {
      @case ('speed-gauge') {
        <mobile-speed-gauge [speedKmh]="speedKmh() ?? 0" />
      }
      @case ('speed-ring') {
        <mobile-speed-ring [speedKmh]="speedKmh() ?? 0" />
      }
      @case ('workout-coach') {
        @if (workoutContext()) {
          <mobile-workout-overlay [ctx]="workoutContext()" [compact]="true" />
        } @else {
          <div class="velo-glass rounded-xl h-full p-4 flex flex-col items-center justify-center text-center">
            <span class="material-symbols-outlined text-on-surface-variant text-[28px]">flag</span>
            <span class="font-grotesk text-label-caps text-on-surface-variant uppercase mt-2 text-[10px]">
              No workout
            </span>
          </div>
        }
      }
      @case ('weather') {
        @if (weather(); as w) {
          <div class="velo-glass rounded-xl h-full p-4 flex flex-col justify-center font-grotesk">
            <div class="flex items-center gap-2">
              <span class="text-2xl">{{ weatherEmoji(w.weatherCode) }}</span>
              <span class="font-sora text-velo-lime text-xl tabular-nums">
                {{ w.tempC != null ? ((w.tempC | number: '1.0-0') + '°') : '—' }}
              </span>
            </div>
            <div class="text-[10px] text-on-surface-variant uppercase mt-1 tracking-wider">
              {{ weatherLabel(w.weatherCode) }}
            </div>
            <div class="text-xs text-on-surface tabular-nums mt-2">
              {{ w.windSpeedKmh != null ? ((w.windSpeedKmh | number: '1.0-0') + ' km/h') : '—' }}
              <span class="text-on-surface-variant text-[10px] uppercase ml-1">
                {{ windCardinal(w.windDirectionDeg) }}
              </span>
            </div>
          </div>
        } @else {
          <div class="velo-glass rounded-xl h-full p-4 flex items-center justify-center text-on-surface-variant text-[10px] font-grotesk uppercase">
            Weather pending
          </div>
        }
      }
      @case ('map') {
        <!-- TODO: live-recording map widget. For now a placeholder so
             the layout still renders meaningfully in the editor. -->
        <div class="velo-glass rounded-xl h-full p-4 flex flex-col items-center justify-center text-center">
          <span class="material-symbols-outlined text-on-surface-variant text-[28px]">map</span>
          <span class="font-grotesk text-label-caps text-on-surface-variant uppercase mt-2 text-[10px]">
            Map coming soon
          </span>
        </div>
      }
      @default {
        <!-- Standard numeric tile: label + (value | "No sensor") + unit. -->
        <div class="velo-glass rounded-xl h-full p-4 flex flex-col items-start justify-center">
          <div class="font-grotesk text-label-caps text-on-surface-variant uppercase text-[10px] tracking-wider mb-2 flex items-center gap-1">
            {{ tileLabel() }}
            @if (sensorMissing()) {
              <span class="material-symbols-outlined text-amber-400 text-[12px]"
                    aria-label="Sensor not connected">bluetooth_disabled</span>
            }
          </div>
          @if (sensorMissing()) {
            <span class="font-grotesk text-label-caps text-amber-300/80 uppercase text-xs">
              No sensor
            </span>
          } @else {
            <div class="flex items-baseline gap-1">
              <span class="font-sora tabular-nums leading-none text-velo-lime text-3xl">
                {{ tileValue() }}
              </span>
              @if (tileUnit()) {
                <span class="font-grotesk text-on-surface-variant uppercase text-[10px]">
                  {{ tileUnit() }}
                </span>
              }
            </div>
          }
        </div>
      }
    }
  `,
})
export class WidgetRendererComponent {
  readonly widget = input.required<WidgetType>();
  /**
   * True if this widget's source sensor isn't connected. Comes from
   * the parent (which already computes the connected-kinds set) so we
   * don't duplicate the look-up per-widget.
   */
  readonly sensorMissing = input(false);

  private readonly recording = inject(RecordingService);
  private readonly weatherService = inject(WeatherService);

  protected readonly latest = this.recording.latest;
  protected readonly stats = this.recording.stats;
  protected readonly workoutContext = this.recording.workoutContext;
  protected readonly weather = this.weatherService.latest;

  protected readonly speedKmh = computed(() => {
    const mps = this.latest()?.speedMps;
    return mps != null ? mps * 3.6 : undefined;
  });

  protected readonly tileLabel = computed(() => LABELS[this.widget()] ?? '');
  protected readonly tileUnit = computed(() => UNITS[this.widget()] ?? '');
  protected readonly tileValue = computed(() => {
    switch (this.widget()) {
      case 'hr':
        return this.latest()?.hr?.toString() ?? '—';
      case 'cadence':
        return formatNum(this.latest()?.cadenceRpm, 0);
      case 'speed':
        return formatNum(this.speedKmh(), 1);
      case 'power':
        return formatNum(this.latest()?.watts, 0);
      case 'distance': {
        const m = this.stats()?.distanceM ?? this.latest()?.distanceM ?? 0;
        return (m / 1000).toFixed(2);
      }
      case 'avg-hr':
        return formatNum(this.stats()?.avgHr, 0);
      case 'avg-speed': {
        const v = this.stats()?.avgSpeedMps;
        return v != null ? (v * 3.6).toFixed(1) : '—';
      }
      case 'lap-time':
        return formatDuration(this.recording.currentLapStats()?.durationSec ?? 0);
      case 'total-time':
        return formatDuration(this.stats()?.durationSec ?? 0);
      default:
        return '';
    }
  });

  protected weatherEmoji(code: number | null | undefined): string {
    return describeWeather(code ?? 0).emoji;
  }
  protected weatherLabel(code: number | null | undefined): string {
    return describeWeather(code ?? 0).label;
  }
  protected windCardinal(deg: number | null | undefined): string {
    return deg == null ? '' : compassCardinal(deg);
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

function formatNum(v: number | null | undefined, digits: number): string {
  return v != null ? v.toFixed(digits) : '—';
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}
