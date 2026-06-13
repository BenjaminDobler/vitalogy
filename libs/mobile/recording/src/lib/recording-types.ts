/** One row of data captured during a recording. */
export interface RecordingSample {
  /** Milliseconds since session start. */
  t: number;
  /** Heart rate (bpm). */
  hr?: number;
  /** Cadence (rpm). */
  cadenceRpm?: number;
  /** Instantaneous speed (m/s). */
  speedMps?: number;
  /** Cumulative distance from CSC tracker (m). */
  distanceM?: number;
  /** GPS latitude (degrees). */
  lat?: number;
  /** GPS longitude (degrees). */
  lng?: number;
  /** Altitude from GPS (m). */
  altitudeM?: number;
}

export interface RecordingSession {
  id: string;
  startedAt: number;
  endedAt?: number;
  samples: RecordingSample[];
}

export interface LiveStats {
  /** Duration in seconds. */
  durationSec: number;
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
}
