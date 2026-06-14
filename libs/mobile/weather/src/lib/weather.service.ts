import { Injectable, signal } from '@angular/core';
import type { WeatherSnapshot } from 'data-models';

/**
 * Fetches current weather from Open-Meteo (free, no API key, generous limits).
 *
 *   - start(getLocation) kicks off the refresh loop: immediate fetch, then
 *     every `refreshMs` (default 5 min). `getLocation` is a callback so we
 *     don't have to plumb location into this service.
 *   - stop() halts refreshes.
 *   - latest() exposes the most recent snapshot for both the live UI tile
 *     and the upload payload.
 *
 * Open-Meteo returns wind direction in *meteorological* convention (the
 * compass bearing the wind comes FROM), which is what we want for cycling.
 */
@Injectable({ providedIn: 'root' })
export class WeatherService {
  readonly latest = signal<WeatherSnapshot | null>(null);
  readonly lastError = signal<string | null>(null);
  readonly fetching = signal(false);

  private timerHandle?: ReturnType<typeof setInterval>;
  private getLocation?: () => { lat: number; lng: number } | null;

  start(
    getLocation: () => { lat: number; lng: number } | null,
    refreshMs = 5 * 60 * 1000,
  ): void {
    this.getLocation = getLocation;
    void this.refresh();
    if (this.timerHandle) clearInterval(this.timerHandle);
    this.timerHandle = setInterval(() => void this.refresh(), refreshMs);
  }

  stop(): void {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = undefined;
    }
    this.getLocation = undefined;
  }

  /** Manual refresh — useful when GPS becomes available after start(). */
  async refresh(): Promise<void> {
    const loc = this.getLocation?.();
    if (!loc) return;
    this.fetching.set(true);
    this.lastError.set(null);
    try {
      const snapshot = await fetchOpenMeteoCurrent(loc.lat, loc.lng);
      this.latest.set(snapshot);
    } catch (err) {
      this.lastError.set(toMessage(err));
    } finally {
      this.fetching.set(false);
    }
  }
}

interface OpenMeteoResponse {
  current?: {
    time: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    wind_gusts_10m?: number;
    precipitation?: number;
    weather_code?: number;
  };
}

async function fetchOpenMeteoCurrent(
  lat: number,
  lng: number,
): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'precipitation',
      'weather_code',
    ].join(','),
    wind_speed_unit: 'kmh',
    timezone: 'auto',
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }
  const data = (await res.json()) as OpenMeteoResponse;
  const c = data.current;
  if (!c) throw new Error('Open-Meteo returned no current data');
  return {
    tempC: nullable(c.temperature_2m),
    apparentTempC: nullable(c.apparent_temperature),
    humidityPct: nullable(c.relative_humidity_2m),
    windSpeedKmh: nullable(c.wind_speed_10m),
    windDirectionDeg: nullable(c.wind_direction_10m),
    windGustKmh: nullable(c.wind_gusts_10m),
    precipMm: nullable(c.precipitation),
    weatherCode: nullable(c.weather_code),
    source: 'open-meteo:current',
    observedAt: c.time,
  };
}

function nullable(v: number | undefined): number | null {
  return v == null ? null : v;
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
