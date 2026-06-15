import {
  CHARACTERISTIC_UUIDS,
  SERVICE_UUIDS,
  SensorAdapter,
  u16Diff,
} from './sensor-adapter';

/** Pre-tracker decode of a Cycling Power Measurement packet (0x2A63). */
export interface PowerRaw {
  /** Instantaneous power in watts (signed — coasting downhill can be negative). */
  watts: number;
  /** Cumulative crank revolutions, if crank rev data is included. */
  crankRev?: number;
  /** Last crank event timestamp in 1/1024 s units. */
  crankTime?: number;
}

/**
 * Parses the Cycling Power Measurement characteristic per Bluetooth SIG.
 *
 *   bytes 0-1: flags (uint16 LE)
 *     bit 0   pedal power balance present (u8 follows)
 *     bit 2   accumulated torque present  (u16 follows)
 *     bit 4   wheel rev data present      (u32 + u16 follow)
 *     bit 5   crank rev data present      (u16 + u16 follow) ← we want this
 *     ...     extreme magnitudes etc.
 *   bytes 2-3: instantaneous power (sint16 LE, watts)
 *
 * We walk the optional fields in spec order to skip over any present-but-
 * unused ones, then decode crank revs if they're there. Cadence is derived
 * by PowerTracker (cross-packet diff). Power meters that DON'T expose
 * crank revs still report watts fine — cadence just stays undefined.
 */
function parsePower(data: DataView): PowerRaw {
  const flags = data.getUint16(0, true);
  const watts = data.getInt16(2, true);
  let offset = 4;

  const pedalPowerBalance = (flags & 0x0001) !== 0;
  if (pedalPowerBalance) offset += 1;

  const accumulatedTorque = (flags & 0x0004) !== 0;
  if (accumulatedTorque) offset += 2;

  const wheelRev = (flags & 0x0010) !== 0;
  if (wheelRev) offset += 6; // u32 revs + u16 time

  const crankRev = (flags & 0x0020) !== 0;
  const out: PowerRaw = { watts };
  if (crankRev && offset + 4 <= data.byteLength) {
    out.crankRev = data.getUint16(offset, true);
    offset += 2;
    out.crankTime = data.getUint16(offset, true);
  }
  return out;
}

export const POWER_ADAPTER: SensorAdapter<PowerRaw> = {
  kind: 'POWER',
  name: 'Power Meter',
  serviceUuid: SERVICE_UUIDS.CYCLING_POWER,
  measurementCharacteristic: CHARACTERISTIC_UUIDS.CYCLING_POWER_MEASUREMENT,
  parse: parsePower,
};

/** Decoded reading downstream consumers see. */
export interface PowerReading {
  watts: number;
  /** Cadence (rpm) when crank-rev data is included. */
  cadenceRpm?: number;
}

/**
 * Cross-packet state for cadence derivation. One instance per power-meter
 * device. Power meters that don't expose crank revs simply never populate
 * cadence — `update()` still returns the watts.
 */
export class PowerTracker {
  private prev?: PowerRaw;

  update(raw: PowerRaw): PowerReading {
    const out: PowerReading = { watts: raw.watts };
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
    this.prev = raw;
    return out;
  }

  reset(): void {
    this.prev = undefined;
  }
}
