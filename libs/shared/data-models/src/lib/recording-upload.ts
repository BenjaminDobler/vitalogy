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
  /** Weather snapshot — most-recent observation during the session. */
  weather?: WeatherSnapshot;
}

export interface UploadSample {
  /** Milliseconds since session start. */
  t: number;
  hr?: number;
  cadenceRpm?: number;
  speedMps?: number;
  /** Cumulative distance in meters. */
  distanceM?: number;
  lat?: number;
  lng?: number;
  altitudeM?: number;
}

export interface UploadActivityResponse {
  activityId: string;
  /** True if the session was already present (idempotent re-upload). */
  alreadyExisted: boolean;
}
