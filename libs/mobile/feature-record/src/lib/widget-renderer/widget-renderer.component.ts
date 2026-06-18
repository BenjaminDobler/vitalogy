import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import type { WidgetType } from 'data-models';
import { BleManager } from 'ble';
import { RecordingService } from 'recording';
import { WeatherService } from 'weather';
import {
  RideWidgetComponent,
  type RideWidgetData,
  type RideWidgetSensorKind,
} from 'ride-widgets';

/**
 * Mobile-side wrapper around the shared RideWidgetComponent. Pulls
 * live data from RecordingService / WeatherService / BleManager and
 * packs it into the single `RideWidgetData` object the shared widget
 * consumes.
 *
 * The selector + input shape (`widget` + the legacy `sensorMissing`
 * input) is preserved so the feature-record carousel doesn't have to
 * change.  `sensorMissing` is now ignored — the shared widget derives
 * it from `data.missingSensors`, which is the cleaner single-source
 * representation.
 */
@Component({
  selector: 'mobile-widget-renderer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RideWidgetComponent],
  template: `<lib-ride-widget [widget]="widget()" [data]="data()" />`,
})
export class WidgetRendererComponent {
  readonly widget = input.required<WidgetType>();
  /** @deprecated Carried for source-compatibility; ignored by the wrapper. */
  readonly sensorMissing = input(false);

  private readonly ble = inject(BleManager);
  private readonly recording = inject(RecordingService);
  private readonly weatherService = inject(WeatherService);

  protected readonly data = computed<RideWidgetData>(() => {
    const latest = this.recording.latest();
    const stats = this.recording.stats();
    const lap = this.recording.currentLapStats();
    const weather = this.weatherService.latest();
    const session = this.recording.session();
    const speedKmh = latest?.speedMps != null ? latest.speedMps * 3.6 : null;
    const avgSpeedKmh =
      stats?.avgSpeedMps != null ? stats.avgSpeedMps * 3.6 : null;
    const distanceM = stats?.distanceM ?? latest?.distanceM ?? 0;

    // Walk connected sensors to figure out which of the three kinds the
    // widget cares about are missing right now. This drives per-tile
    // "no sensor" badges in the shared renderer.
    const kinds = new Set(this.ble.connected().flatMap((c) => c.subscribed));
    const missingSensors: RideWidgetSensorKind[] = [];
    if (!kinds.has('HRM')) missingSensors.push('HRM');
    if (!kinds.has('CSC')) missingSensors.push('CSC');
    if (!kinds.has('POWER')) missingSensors.push('POWER');

    // Build the live route trail for the map widget. Walk the session
    // samples (every recorded second), keep only the ones that
    // actually carry GPS, and downsample long rides so we don't ship
    // 10k+ points to Leaflet's polyline. ~600 points keeps the trail
    // smooth at any zoom while keeping per-tick update cost bounded.
    const routeLatLng: [number, number][] = [];
    if (session) {
      const withGps: [number, number][] = [];
      for (const s of session.samples) {
        if (s.lat != null && s.lng != null) {
          withGps.push([s.lat, s.lng]);
        }
      }
      const TARGET = 600;
      if (withGps.length <= TARGET) {
        routeLatLng.push(...withGps);
      } else {
        const step = withGps.length / TARGET;
        for (let i = 0; i < TARGET; i++) {
          routeLatLng.push(withGps[Math.floor(i * step)]);
        }
        // Always keep the true latest point so the auto-follow camera
        // tracks the rider's actual current position, not a sampled
        // approximation.
        routeLatLng.push(withGps[withGps.length - 1]);
      }
    }

    return {
      hr: latest?.hr ?? null,
      cadence: latest?.cadenceRpm ?? null,
      power: latest?.watts ?? null,
      speedKmh,
      distanceKm: distanceM / 1000,
      avgHr: stats?.avgHr ?? null,
      avgSpeedKmh,
      lapDurationSec: lap?.durationSec ?? 0,
      totalDurationSec: stats?.durationSec ?? 0,
      weather: weather
        ? {
            tempC: weather.tempC ?? null,
            weatherCode: weather.weatherCode ?? 0,
            windSpeedKmh: weather.windSpeedKmh ?? null,
            windDirectionDeg: weather.windDirectionDeg ?? null,
          }
        : null,
      workoutContext: this.recording.workoutContext(),
      routeLatLng,
      missingSensors,
    };
  });
}
