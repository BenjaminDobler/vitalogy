import { inject, Injectable, signal } from '@angular/core';
import { BleManager, type BleReading, type CscReading, type HrmReading } from 'ble';
import { RecordingService } from 'recording';
import { WeatherService } from 'weather';

/**
 * Synthetic-data simulator. Pumps slider-driven sensor/GPS/weather readings
 * into the same channels the real services use. Designed for `apps/simulator`,
 * where you iterate on the record UI without leaving the desktop.
 *
 * Companion to ReplayDriver:
 *  - SensorSim: hand-cranked numbers via signals (great for edge cases)
 *  - ReplayDriver: walks samples from a previously-recorded activity
 */
@Injectable({ providedIn: 'root' })
export class SensorSim {
  private readonly ble = inject(BleManager);
  private readonly recording = inject(RecordingService);
  private readonly weather = inject(WeatherService);

  readonly running = signal(false);

  /** Speed in km/h. Drives CSC speed and how fast GPS coordinates move. */
  readonly simSpeedKmh = signal(28);
  readonly simHr = signal(145);
  readonly simCadenceRpm = signal(85);

  private tickHandle?: ReturnType<typeof setInterval>;
  private cumulativeDistanceM = 0;
  // Berlin Mitte default. Override per-run by setStartLocation().
  private currentLat = 52.520008;
  private currentLng = 13.404954;
  private bearing = 0;

  setStartLocation(lat: number, lng: number): void {
    this.currentLat = lat;
    this.currentLng = lng;
  }

  start(): void {
    if (this.running()) return;
    this.running.set(true);
    this.cumulativeDistanceM = 0;

    this.ble.connected.set([
      { deviceId: 'sim-tickr', name: 'Sim TICKR', subscribed: ['HRM'] },
      { deviceId: 'sim-bluesc', name: 'Sim Blue SC', subscribed: ['CSC'] },
    ]);

    this.weather.latest.set({
      tempC: 18,
      apparentTempC: 16,
      humidityPct: 62,
      windSpeedKmh: 12,
      windDirectionDeg: 270,
      windGustKmh: 18,
      precipMm: 0,
      weatherCode: 2,
      source: 'sim:synthetic',
      observedAt: new Date().toISOString(),
    });

    this.tickHandle = setInterval(() => this.tick(), 1000);
  }

  stop(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.tickHandle = undefined;
    this.ble.connected.set([]);
    this.running.set(false);
  }

  private tick(): void {
    const now = Date.now();
    const speedKmh = this.simSpeedKmh();
    const speedMps = speedKmh / 3.6;

    const hrm: BleReading<HrmReading> = {
      kind: 'HRM',
      deviceId: 'sim-tickr',
      receivedAt: now,
      data: {
        bpm: Math.round(this.simHr() + (Math.random() - 0.5) * 4),
        rrMs: [],
      },
    };
    this.ble.readings$.next(hrm as BleReading);

    this.cumulativeDistanceM += speedMps;
    const csc: BleReading<CscReading> = {
      kind: 'CSC',
      deviceId: 'sim-bluesc',
      receivedAt: now,
      data: {
        cadenceRpm: speedKmh > 0 ? this.simCadenceRpm() : 0,
        speedMps,
        cumulativeDistanceM: this.cumulativeDistanceM,
      },
    };
    this.ble.readings$.next(csc as BleReading);

    // Walk the position one second along a slowly rotating bearing.
    const earthRadiusM = 6_371_000;
    this.bearing += 0.01;
    const latRad = (this.currentLat * Math.PI) / 180;
    const deltaLat =
      ((speedMps * Math.cos(this.bearing)) / earthRadiusM) * (180 / Math.PI);
    const deltaLng =
      ((speedMps * Math.sin(this.bearing)) / earthRadiusM) *
      (180 / Math.PI) /
      Math.cos(latRad);
    this.currentLat += deltaLat;
    this.currentLng += deltaLng;
    this.recording.pushLocation(
      this.currentLat,
      this.currentLng,
      50 + Math.sin(now / 30000) * 20,
    );
  }
}
