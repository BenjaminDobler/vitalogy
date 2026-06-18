import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { WidgetType } from 'data-models';
import { RideWidgetComponent, type RideWidgetData } from 'ride-widgets';

/**
 * Editor-side wrapper around the shared RideWidgetComponent. Supplies
 * a constant `SAMPLE_DATA` so the canvas previews render with
 * realistic values without needing any of mobile's recording / weather
 * / BLE services.
 *
 * Sample values are chosen to read as a mid-ride snapshot (HR 142,
 * cadence 86, speed 28.4…). Hard-coded rather than randomized so
 * screenshots of the editor are diff-stable.
 *
 * Instantiated dynamically by RideViewEditorComponent via
 * `createComponent()` — see editor for the lifecycle plumbing.
 */
@Component({
  selector: 'lib-widget-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full h-full' },
  imports: [RideWidgetComponent],
  template: `<lib-ride-widget [widget]="widget()" [data]="sample" />`,
})
export class WidgetPreviewComponent {
  readonly widget = input.required<WidgetType>();
  protected readonly sample: RideWidgetData = SAMPLE_DATA;
}

const SAMPLE_DATA: RideWidgetData = {
  hr: 142,
  cadence: 86,
  power: 214,
  speedKmh: 28.4,
  distanceKm: 12.45,
  avgHr: 138,
  avgSpeedKmh: 24.7,
  lapDurationSec: 3 * 60 + 42,
  totalDurationSec: 1 * 3600 + 24 * 60 + 35,
  weather: {
    tempC: 18,
    weatherCode: 2,
    windSpeedKmh: 12,
    windDirectionDeg: 225,
  },
  // Sample route — a short loop around the Eiffel Tower so the map
  // widget renders a recognizable Paris street pattern in the editor.
  // Lat/lng pairs are picked by hand to trace a short circuit a rider
  // might do at the Champ de Mars / Quai Branly area.
  routeLatLng: [
    [48.8584, 2.2945],
    [48.8588, 2.2950],
    [48.8595, 2.2955],
    [48.8603, 2.2962],
    [48.8612, 2.2970],
    [48.8615, 2.2980],
    [48.8612, 2.2995],
    [48.8605, 2.3000],
    [48.8595, 2.2995],
    [48.8588, 2.2985],
    [48.8584, 2.2970],
    [48.8580, 2.2960],
    [48.8584, 2.2945],
  ],
  // Sample workout context so the workout-coach widget renders a
  // realistic in-zone interval card in the editor preview. Conforms
  // to the minimal RideWidgetWorkoutContext shape — the shared widget
  // only reads what it needs.
  workoutContext: {
    workout: { intervals: new Array(6).fill(null) },
    intervalIndex: 1,
    intervalLabel: "Threshold 3'",
    intervalRemainingSec: 272,
    target: { label: 'Z3-Z4' },
    currentValue: 152,
    status: 'in',
  },
  missingSensors: [],
};
