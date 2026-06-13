import {
  CHARACTERISTIC_UUIDS,
  SERVICE_UUIDS,
  SensorAdapter,
  u16Diff,
  u32Diff,
} from './sensor-adapter';

/** Raw, pre-tracker decode of a CSC packet. */
export interface CscRaw {
  /** u32 cumulative wheel revolutions, if wheel data is present. */
  wheelRev?: number;
  /** u16 wheel event timestamp in 1/1024 s units, if wheel data is present. */
  wheelTime?: number;
  /** u16 cumulative crank revolutions, if crank data is present. */
  crankRev?: number;
  /** u16 crank event timestamp in 1/1024 s units, if crank data is present. */
  crankTime?: number;
}

/**
 * Parses the CSC Measurement characteristic (0x2A5B):
 *   - byte 0: flags
 *       bit 0: wheel revolution data present
 *       bit 1: crank revolution data present
 *   - (optional) u32 cumulative wheel revs + u16 last wheel event time
 *   - (optional) u16 cumulative crank revs + u16 last crank event time
 *
 * Note the asymmetry: wheel revs are u32 (they grow unbounded over a ride),
 * crank revs are u16 (will wrap roughly every 11 hours at 100 rpm — handled
 * by u16Diff in CscTracker).
 */
function parseCsc(data: DataView): CscRaw {
  const flags = data.getUint8(0);
  const wheelPresent = (flags & 0x01) !== 0;
  const crankPresent = (flags & 0x02) !== 0;
  let offset = 1;
  const out: CscRaw = {};
  if (wheelPresent) {
    out.wheelRev = data.getUint32(offset, true);
    offset += 4;
    out.wheelTime = data.getUint16(offset, true);
    offset += 2;
  }
  if (crankPresent) {
    out.crankRev = data.getUint16(offset, true);
    offset += 2;
    out.crankTime = data.getUint16(offset, true);
    offset += 2;
  }
  return out;
}

export const CSC_ADAPTER: SensorAdapter<CscRaw> = {
  kind: 'CSC',
  name: 'Speed / Cadence',
  serviceUuid: SERVICE_UUIDS.CYCLING_SPEED_CADENCE,
  measurementCharacteristic: CHARACTERISTIC_UUIDS.CSC_MEASUREMENT,
  parse: parseCsc,
};

/** Final reading downstream consumers see. */
export interface CscReading {
  cadenceRpm?: number;
  speedMps?: number;
  /** Monotonically increasing total distance for this tracker instance, in meters. */
  cumulativeDistanceM?: number;
}

/**
 * Stateful helper that turns raw CSC packets into cadence (rpm) and
 * speed (m/s) by differencing successive packets. One instance per sensor.
 *
 * Handles:
 *  - u16 wrap on crank revs / event timestamps
 *  - u32 wrap on wheel revs (paranoia — would take ~weeks of riding)
 *  - "no new event since last packet" → emit 0 instead of NaN
 *  - cumulative distance integration
 */
export class CscTracker {
  private prev?: CscRaw;
  private distanceM = 0;

  /**
   * @param wheelCircumferenceM 2.105 = 700×25c; 2.155 = 700×28c; 2.000 = 26×1.95 MTB
   */
  constructor(public wheelCircumferenceM = 2.105) {}

  update(raw: CscRaw): CscReading {
    const out: CscReading = {};
    const prev = this.prev;

    if (
      prev &&
      raw.crankRev != null &&
      raw.crankTime != null &&
      prev.crankRev != null &&
      prev.crankTime != null
    ) {
      const dRev = u16Diff(raw.crankRev, prev.crankRev);
      const dTime = u16Diff(raw.crankTime, prev.crankTime);
      out.cadenceRpm = dTime > 0 ? ((dRev * 1024) / dTime) * 60 : 0;
    }

    if (
      prev &&
      raw.wheelRev != null &&
      raw.wheelTime != null &&
      prev.wheelRev != null &&
      prev.wheelTime != null
    ) {
      const dRev = u32Diff(raw.wheelRev, prev.wheelRev);
      const dTime = u16Diff(raw.wheelTime, prev.wheelTime);
      this.distanceM += dRev * this.wheelCircumferenceM;
      out.speedMps =
        dTime > 0 ? ((dRev * 1024) / dTime) * this.wheelCircumferenceM : 0;
      out.cumulativeDistanceM = this.distanceM;
    }

    this.prev = raw;
    return out;
  }

  reset(): void {
    this.prev = undefined;
    this.distanceM = 0;
  }
}
