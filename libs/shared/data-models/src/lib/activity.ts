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
