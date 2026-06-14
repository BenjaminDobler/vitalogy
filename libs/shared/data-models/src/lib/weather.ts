/**
 * Snapshot of weather conditions at a specific moment + location.
 * Numeric units are SI-ish / km-h for human-readability on bike screens.
 *
 * `windDirectionDeg` is the meteorological convention: the bearing the wind
 * comes FROM, not where it's heading. 0=N, 90=E, 180=S, 270=W.
 *
 * Source format: `<provider>:<endpoint>`, e.g. 'open-meteo:current',
 * 'open-meteo:archive', 'dwd:cdc'. Lets us know how to interpret the data
 * and whether to refresh from a more authoritative source later.
 */
export interface WeatherSnapshot {
  tempC?: number | null;
  apparentTempC?: number | null;
  humidityPct?: number | null;
  windSpeedKmh?: number | null;
  windDirectionDeg?: number | null;
  windGustKmh?: number | null;
  precipMm?: number | null;
  weatherCode?: number | null;
  source?: string | null;
  observedAt?: string | null;
}

/** Maps a subset of WMO 4677 codes to a stable emoji + label pair. */
export function describeWeather(code: number | null | undefined): {
  emoji: string;
  label: string;
} {
  if (code == null) return { emoji: '❓', label: 'Unknown' };
  if (code === 0) return { emoji: '☀️', label: 'Clear' };
  if (code === 1) return { emoji: '🌤', label: 'Mostly clear' };
  if (code === 2) return { emoji: '⛅️', label: 'Partly cloudy' };
  if (code === 3) return { emoji: '☁️', label: 'Overcast' };
  if (code === 45 || code === 48) return { emoji: '🌫', label: 'Fog' };
  if (code >= 51 && code <= 57) return { emoji: '🌦', label: 'Drizzle' };
  if (code >= 61 && code <= 67) return { emoji: '🌧', label: 'Rain' };
  if (code >= 71 && code <= 77) return { emoji: '🌨', label: 'Snow' };
  if (code >= 80 && code <= 82) return { emoji: '🌧', label: 'Showers' };
  if (code === 85 || code === 86) return { emoji: '🌨', label: 'Snow showers' };
  if (code >= 95 && code <= 99) return { emoji: '⛈', label: 'Thunderstorm' };
  return { emoji: '❓', label: `Code ${code}` };
}

/** Compass cardinal (N, NE, E, ...) for a meteorological bearing. */
export function compassCardinal(degrees: number | null | undefined): string {
  if (degrees == null) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
  return dirs[Math.round(degrees / 45) % 8];
}
