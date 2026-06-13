import type { Activity } from 'data-models';

/**
 * Builds a structured prompt the AI can reason over. Activities are serialized
 * as compact JSON; the question is the user's free-form input.
 */
export function buildAnalysisPrompt(opts: {
  activities: Activity[];
  question: string;
}): string {
  const compact = opts.activities.map((a) => ({
    name: a.name,
    sportType: a.sportType,
    start: a.startTime,
    distanceKm: +(a.distanceM / 1000).toFixed(2),
    durationMin: Math.round(a.durationSec / 60),
    elevationGainM: a.elevationGainM ?? null,
    avgKmh: a.avgSpeedMps != null ? +(a.avgSpeedMps * 3.6).toFixed(1) : null,
    avgWatts: a.avgWatts ?? null,
    weightedAvgWatts: a.weightedAvgWatts ?? null,
    avgHr: a.avgHeartrate ?? null,
    maxHr: a.maxHeartrate ?? null,
    kJ: a.kilojoules ?? null,
    trainer: a.trainerActivity,
  }));

  return [
    'You are a cycling coach analyzing training data.',
    'Here is the rider\'s recent activity data (JSON):',
    '',
    '```json',
    JSON.stringify(compact, null, 2),
    '```',
    '',
    'Rider\'s question:',
    opts.question,
    '',
    'Answer with concrete observations grounded in the numbers above. ' +
      'Be specific (cite distances, durations, power, HR). If the data is insufficient, say so.',
  ].join('\n');
}
