/**
 * Minimal workout-context shape consumed by the workout-coach widget.
 * Structurally a subset of mobile's `WorkoutLiveContext` (defined in
 * libs/mobile/recording), so callers can pass that type directly via
 * structural compatibility without us having to depend on the mobile
 * recording lib here. Only the fields the widget actually renders.
 */
export interface RideWidgetWorkoutContext {
  workout: { intervals: ReadonlyArray<unknown> };
  intervalIndex: number;
  intervalLabel: string;
  intervalRemainingSec: number;
  target: { label: string };
  currentValue: number | null;
  status: 'in' | 'below' | 'above' | 'unknown';
}

/**
 * Weather snapshot used by the weather widget. Subset of WeatherSample —
 * just the fields the widget actually renders, kept here so the
 * shared lib doesn't have to pull in the WeatherService types.
 */
export interface RideWidgetWeather {
  tempC: number | null;
  weatherCode: number;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
}

/**
 * Sensor kinds whose absence drives the per-tile "no sensor" badge.
 * Mirrors the BleManager `SensorKind` union but is duplicated here so
 * the shared widget lib stays free of the mobile-only `ble` dep.
 */
export type RideWidgetSensorKind = 'HRM' | 'CSC' | 'POWER';

/**
 * Everything the ride widgets need to render. Either bundled live
 * from mobile's RecordingService / WeatherService / BleManager, or
 * supplied as a static sample object from the web editor preview.
 *
 * Designed as a single object input so a parent rendering many cells
 * can pass one signal-derived value down rather than prop-drilling
 * a dozen individual signals per widget.
 */
export interface RideWidgetData {
  hr: number | null;
  cadence: number | null;
  power: number | null;
  speedKmh: number | null;
  distanceKm: number;
  avgHr: number | null;
  avgSpeedKmh: number | null;
  lapDurationSec: number;
  totalDurationSec: number;
  weather: RideWidgetWeather | null;
  workoutContext: RideWidgetWorkoutContext | null;
  /**
   * Sensor kinds that are NOT currently connected. The widget uses
   * this to decide whether to render a "No sensor" badge in place of
   * `—`, so transient nulls (sensor connected but no signal yet) keep
   * showing `—` instead of confusing the rider.
   */
  missingSensors: ReadonlyArray<RideWidgetSensorKind>;
}

/**
 * A zero-state RideWidgetData — every field null/0/empty. Useful as
 * a default while live data is loading, or as a starting point for
 * sample data in the editor.
 */
export const EMPTY_RIDE_WIDGET_DATA: RideWidgetData = {
  hr: null,
  cadence: null,
  power: null,
  speedKmh: null,
  distanceKm: 0,
  avgHr: null,
  avgSpeedKmh: null,
  lapDurationSec: 0,
  totalDurationSec: 0,
  weather: null,
  workoutContext: null,
  missingSensors: [],
};
