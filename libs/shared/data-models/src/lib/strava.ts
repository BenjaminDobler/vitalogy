// Minimal subset of the Strava activity payload we care about.
// The full raw object is stored on `Activity.raw` server-side.
export interface StravaSummaryActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_watts?: number;
  weighted_average_watts?: number;
  max_watts?: number;
  kilojoules?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  trainer: boolean;
  commute: boolean;
}
