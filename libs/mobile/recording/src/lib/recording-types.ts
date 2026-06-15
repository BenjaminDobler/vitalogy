/** One row of data captured during a recording. */
export interface RecordingSample {
  /** Milliseconds since session start. */
  t: number;
  /** Heart rate (bpm). */
  hr?: number;
  /** Cadence (rpm). */
  cadenceRpm?: number;
  /** Instantaneous speed (m/s). May be GPS-derived when no wheel sensor. */
  speedMps?: number;
  /**
   * Cumulative distance (m). When a CSC sensor is paired this is the
   * sensor's cumulative-since-power-on reading. When GPS is the only
   * speed source, this is the session-cumulative computed from successive
   * GPS samples.
   */
  distanceM?: number;
  /** Instantaneous power (watts), when a power meter is paired. */
  watts?: number;
  /** GPS latitude (degrees). */
  lat?: number;
  /** GPS longitude (degrees). */
  lng?: number;
  /** Altitude from GPS (m). */
  altitudeM?: number;
}

/** A paused interval inside a session, ms since session start. `end` null = ongoing. */
export interface PauseSegment {
  start: number;
  end: number | null;
}

export interface RecordingSession {
  id: string;
  startedAt: number;
  endedAt?: number;
  samples: RecordingSample[];
  /**
   * Lap boundary timestamps in ms since session start. Each entry marks the
   * END of a lap. Empty array = the whole session is lap 1.
   * Example: [600000, 1200000] → three laps: 0–10min, 10–20min, 20–end.
   */
  lapSplits: number[];
  /** Periods when the session was paused (auto-pause when speed dropped). */
  pauseSegments: PauseSegment[];
  /** Latest weather snapshot taken during the session, if any. */
  weather?: import('data-models').WeatherSnapshot | null;
}

export interface LiveStats {
  /** Moving time in seconds (paused intervals subtracted). The headline value. */
  durationSec: number;
  /** Total wall-clock duration in seconds, including paused intervals. */
  elapsedSec: number;
  /** Cumulative distance in meters. */
  distanceM: number;
  /** Average heart rate over samples where it was non-null. */
  avgHr?: number;
  /** Max heart rate observed. */
  maxHr?: number;
  /** Average cadence over samples where it was non-zero. */
  avgCadenceRpm?: number;
  /** Average speed in m/s, computed from distance / moving time. */
  avgSpeedMps?: number;
  /** Max speed observed. */
  maxSpeedMps?: number;
  /** Average power (watts) over samples where it was non-null. */
  avgWatts?: number;
  /** Max power observed. */
  maxWatts?: number;
}
