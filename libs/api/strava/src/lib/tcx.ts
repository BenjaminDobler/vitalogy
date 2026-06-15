/**
 * Build a TCX (Training Center XML) document for a single activity.
 *
 * Strava parses TCX natively via POST /uploads and preserves GPS,
 * heart rate, cadence and power. We use the Garmin ActivityExtension
 * namespace (ns3) for speed + watts since those aren't in core TCX.
 *
 * Streams are time-aligned: every stream has the same length as
 * `time`, and index i maps to the same instant across all streams.
 * `time` is seconds from `startTime`.
 */
export interface TcxBuildInput {
  startTime: Date;
  sportType: string;
  durationSec: number;
  distanceM: number;
  maxSpeedMps?: number | null;
  avgHeartrate?: number | null;
  maxHeartrate?: number | null;
  kilojoules?: number | null;
  streams: {
    time?: number[];
    latlng?: ([number, number] | null)[];
    altitude?: number[];
    distance?: number[];
    heartrate?: number[];
    cadence?: number[];
    velocity_smooth?: number[];
    watts?: number[];
  };
  laps?: {
    lapIndex: number;
    startTime: Date;
    durationSec: number;
    distanceM: number;
    avgHeartrate?: number | null;
    avgSpeedMps?: number | null;
  }[];
}

const NS = 'http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2';
const NS_EXT = 'http://www.garmin.com/xmlschemas/ActivityExtension/v2';

export function buildTcx(input: TcxBuildInput): string {
  const sport = mapSport(input.sportType);
  const startIso = input.startTime.toISOString();
  const time = input.streams.time ?? [];
  const n = time.length;

  // Pre-compute trackpoint XML. We slice the array per lap below.
  const trackpoints: string[] = [];
  for (let i = 0; i < n; i++) {
    trackpoints.push(buildTrackpoint(i, input));
  }

  // Build laps. If we have explicit laps, partition trackpoints by their
  // [startSec, startSec+duration) window. Otherwise emit a single lap
  // covering the whole activity.
  const lapsXml = buildLapsXml(input, trackpoints);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<TrainingCenterDatabase xmlns="${NS}" xmlns:ns3="${NS_EXT}">`,
    '  <Activities>',
    `    <Activity Sport="${sport}">`,
    `      <Id>${startIso}</Id>`,
    lapsXml,
    `      <Creator xsi:type="Device_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    `        <Name>Vitalogy</Name>`,
    `      </Creator>`,
    '    </Activity>',
    '  </Activities>',
    '</TrainingCenterDatabase>',
    '',
  ].join('\n');
}

function buildLapsXml(input: TcxBuildInput, trackpoints: string[]): string {
  const time = input.streams.time ?? [];
  const startMs = input.startTime.getTime();

  if (!input.laps || input.laps.length === 0) {
    return buildLapXml({
      startIso: input.startTime.toISOString(),
      totalSec: input.durationSec,
      distanceM: input.distanceM,
      maxSpeed: input.maxSpeedMps ?? undefined,
      avgHr: input.avgHeartrate ?? undefined,
      maxHr: input.maxHeartrate ?? undefined,
      kilojoules: input.kilojoules ?? undefined,
      trackpoints,
    });
  }

  return input.laps
    .sort((a, b) => a.lapIndex - b.lapIndex)
    .map((lap) => {
      const lapStartSec = (lap.startTime.getTime() - startMs) / 1000;
      const lapEndSec = lapStartSec + lap.durationSec;
      const lapPoints: string[] = [];
      for (let i = 0; i < time.length; i++) {
        if (time[i] >= lapStartSec && time[i] < lapEndSec) {
          lapPoints.push(trackpoints[i]);
        }
      }
      return buildLapXml({
        startIso: lap.startTime.toISOString(),
        totalSec: lap.durationSec,
        distanceM: lap.distanceM,
        maxSpeed: lap.avgSpeedMps ?? undefined,
        avgHr: lap.avgHeartrate ?? undefined,
        trackpoints: lapPoints,
      });
    })
    .join('\n');
}

function buildLapXml(args: {
  startIso: string;
  totalSec: number;
  distanceM: number;
  maxSpeed?: number;
  avgHr?: number;
  maxHr?: number;
  kilojoules?: number;
  trackpoints: string[];
}): string {
  const parts: string[] = [
    `      <Lap StartTime="${args.startIso}">`,
    `        <TotalTimeSeconds>${args.totalSec.toFixed(0)}</TotalTimeSeconds>`,
    `        <DistanceMeters>${args.distanceM.toFixed(1)}</DistanceMeters>`,
  ];
  if (args.maxSpeed != null) {
    parts.push(`        <MaximumSpeed>${args.maxSpeed.toFixed(3)}</MaximumSpeed>`);
  }
  if (args.kilojoules != null) {
    parts.push(`        <Calories>${Math.round(args.kilojoules)}</Calories>`);
  } else {
    parts.push(`        <Calories>0</Calories>`);
  }
  if (args.avgHr != null) {
    parts.push(
      `        <AverageHeartRateBpm><Value>${Math.round(args.avgHr)}</Value></AverageHeartRateBpm>`,
    );
  }
  if (args.maxHr != null) {
    parts.push(
      `        <MaximumHeartRateBpm><Value>${Math.round(args.maxHr)}</Value></MaximumHeartRateBpm>`,
    );
  }
  parts.push(`        <Intensity>Active</Intensity>`);
  parts.push(`        <TriggerMethod>Manual</TriggerMethod>`);
  parts.push(`        <Track>`);
  parts.push(...args.trackpoints);
  parts.push(`        </Track>`);
  parts.push(`      </Lap>`);
  return parts.join('\n');
}

function buildTrackpoint(i: number, input: TcxBuildInput): string {
  const t = input.streams.time![i];
  const iso = new Date(input.startTime.getTime() + t * 1000).toISOString();
  const lines: string[] = [`          <Trackpoint>`, `            <Time>${iso}</Time>`];

  const pos = input.streams.latlng?.[i];
  if (pos && Number.isFinite(pos[0]) && Number.isFinite(pos[1])) {
    lines.push(`            <Position>`);
    lines.push(`              <LatitudeDegrees>${pos[0].toFixed(7)}</LatitudeDegrees>`);
    lines.push(`              <LongitudeDegrees>${pos[1].toFixed(7)}</LongitudeDegrees>`);
    lines.push(`            </Position>`);
  }

  const alt = input.streams.altitude?.[i];
  if (alt != null) {
    lines.push(`            <AltitudeMeters>${alt.toFixed(2)}</AltitudeMeters>`);
  }
  const dist = input.streams.distance?.[i];
  if (dist != null) {
    lines.push(`            <DistanceMeters>${dist.toFixed(2)}</DistanceMeters>`);
  }
  const hr = input.streams.heartrate?.[i];
  if (hr != null) {
    lines.push(
      `            <HeartRateBpm><Value>${Math.round(hr)}</Value></HeartRateBpm>`,
    );
  }
  const cad = input.streams.cadence?.[i];
  if (cad != null) {
    lines.push(`            <Cadence>${Math.round(cad)}</Cadence>`);
  }

  const speed = input.streams.velocity_smooth?.[i];
  const watts = input.streams.watts?.[i];
  if (speed != null || watts != null) {
    lines.push(`            <Extensions>`);
    lines.push(`              <ns3:TPX>`);
    if (speed != null) {
      lines.push(`                <ns3:Speed>${speed.toFixed(3)}</ns3:Speed>`);
    }
    if (watts != null) {
      lines.push(`                <ns3:Watts>${Math.round(watts)}</ns3:Watts>`);
    }
    lines.push(`              </ns3:TPX>`);
    lines.push(`            </Extensions>`);
  }

  lines.push(`          </Trackpoint>`);
  return lines.join('\n');
}

/** Map our sportType to a TCX-valid Sport attribute. */
function mapSport(sportType: string): 'Biking' | 'Running' | 'Other' {
  const s = sportType.toLowerCase();
  if (s.includes('run') || s.includes('jog')) return 'Running';
  if (
    s.includes('ride') ||
    s.includes('bik') ||
    s.includes('cycl') ||
    s.includes('gravel') ||
    s.includes('mountain')
  ) {
    return 'Biking';
  }
  return 'Other';
}
