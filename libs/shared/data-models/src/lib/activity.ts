export type ActivitySource =
  | 'STRAVA'
  | 'MANUAL'
  | 'FIT_FILE'
  | 'TCX_FILE'
  | 'GPX_FILE';

export type StreamType =
  | 'time'
  | 'distance'
  | 'velocity_smooth'
  | 'altitude'
  | 'heartrate'
  | 'cadence'
  | 'watts'
  | 'temp'
  | 'moving'
  | 'grade_smooth'
  | 'latlng';

export interface Activity {
  id: string;
  userId: string;
  source: ActivitySource;
  sourceId: string;
  name: string;
  sportType: string;
  startTime: string;
  timezone?: string | null;
  durationSec: number;
  elapsedSec: number;
  distanceM: number;
  elevationGainM?: number | null;
  avgSpeedMps?: number | null;
  maxSpeedMps?: number | null;
  avgWatts?: number | null;
  weightedAvgWatts?: number | null;
  maxWatts?: number | null;
  kilojoules?: number | null;
  avgHeartrate?: number | null;
  maxHeartrate?: number | null;
  avgCadence?: number | null;
  trainerActivity: boolean;
  commute: boolean;
  // Weather snapshot at session start (when known).
  tempC?: number | null;
  apparentTempC?: number | null;
  humidityPct?: number | null;
  windSpeedKmh?: number | null;
  windDirectionDeg?: number | null;
  windGustKmh?: number | null;
  precipMm?: number | null;
  weatherCode?: number | null;
  weatherSource?: string | null;
  weatherObservedAt?: string | null;
  // Strava export tracking. Set after a non-STRAVA activity has been
  // pushed up via POST /api/strava/export/:id.
  stravaExportId?: string | null;
  stravaActivityId?: string | null;
  stravaExportedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityStream {
  type: StreamType;
  resolution: 'low' | 'medium' | 'high';
  data: number[] | [number, number][];
}

export interface Lap {
  lapIndex: number;
  name?: string | null;
  startTime: string;
  durationSec: number;
  distanceM: number;
  avgWatts?: number | null;
  avgHeartrate?: number | null;
  avgSpeedMps?: number | null;
  elevationGainM?: number | null;
}

export interface ActivityDetail extends Activity {
  streams: ActivityStream[];
  laps: Lap[];
}
