/**
 * Wire shape for GET /api/activities/achievements. Each PR category is
 * null when the user has no rides with that metric (e.g. fresh accounts
 * or rides without GPS speed).
 */

export interface AchievementActivityStub {
  id: string;
  name: string;
  startTime: string;
  sportType: string;
}

export interface AchievementsResponse {
  longestDistance: { activity: AchievementActivityStub; valueM: number } | null;
  mostElevation: { activity: AchievementActivityStub; valueM: number } | null;
  longestDuration: {
    activity: AchievementActivityStub;
    valueSec: number;
  } | null;
  highestAvgSpeed: {
    activity: AchievementActivityStub;
    valueMps: number;
  } | null;
  highestMaxSpeed: {
    activity: AchievementActivityStub;
    valueMps: number;
  } | null;
  fastestLap: {
    activity: AchievementActivityStub;
    lapIndex: number;
    valueMps: number;
    distanceM: number;
    durationSec: number;
  } | null;
}
