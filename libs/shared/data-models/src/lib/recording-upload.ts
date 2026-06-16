import type { WeatherSnapshot } from './weather.js';

/**
 * Wire DTO for a recorded session uploaded by the mobile app.
 * Designed so the backend can build a complete Activity + Stream tree from
 * a single POST.
 */
export interface UploadActivityRequest {
  /** Stable local session id — used as sourceId for idempotency. */
  sessionId: string;
  /** User-supplied or auto-generated activity name. */
  name?: string;
  /** Default 'Ride'. Could be 'VirtualRide', 'GravelRide', etc. */
  sportType?: string;
  /** ISO timestamp. */
  startedAt: string;
  /** ISO timestamp. */
  endedAt: string;
  /** 1Hz sample timeline. */
  samples: UploadSample[];
  /**
   * Lap boundaries (ms since session start). Each entry is the END of a lap.
   * Empty / undefined = the whole session is lap 1 (and no Lap rows get created).
   */
  lapSplits?: number[];
  /**
   * Paused intervals (ms since session start). Used to split moving time
   * from elapsed wall-clock time. Empty / undefined = never paused.
   */
  pauseSegments?: Array<{ start: number; end: number }>;
  /** Weather snapshot — most-recent observation during the session. */
  weather?: WeatherSnapshot;
  /**
   * Workout this recording was executing. When set, the server links the
   * resulting Activity row to the Workout (status → COMPLETED, activityId
   * pointed at the real activity id). Tolerates upload happening hours
   * after the rider finished — the mobile UI marked it complete locally
   * already; this step just makes the linkage usable from the web.
   */
  workoutId?: string;
}

export interface UploadSample {
  /** Milliseconds since session start. */
  t: number;
  hr?: number;
  cadenceRpm?: number;
  speedMps?: number;
  /** Cumulative distance in meters. */
  distanceM?: number;
  /** Instantaneous power (watts), when a power meter is paired. */
  watts?: number;
  lat?: number;
  lng?: number;
  altitudeM?: number;
}

export interface UploadActivityResponse {
  activityId: string;
  /** True if the session was already present (idempotent re-upload). */
  alreadyExisted: boolean;
}
