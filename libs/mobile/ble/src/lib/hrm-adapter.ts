import {
  CHARACTERISTIC_UUIDS,
  SERVICE_UUIDS,
  SensorAdapter,
} from './sensor-adapter';

export interface HrmReading {
  /** Heart rate in beats per minute. */
  bpm: number;
  /**
   * RR intervals (ms) since the last notification. May be empty if the sensor
   * doesn't expose them. TICKR exposes them — handy for HRV later.
   */
  rrMs: number[];
  /** Sensor reports contact with the chest, if supported. undefined = unsupported. */
  contact?: boolean;
}

/**
 * Parses the Heart Rate Measurement characteristic (0x2A37) per the
 * Bluetooth SIG GATT spec:
 *   - byte 0: flags
 *       bit 0: HR value is u16 (else u8)
 *       bit 1: sensor contact detected (only meaningful if bit 2 set)
 *       bit 2: sensor contact supported
 *       bit 3: energy expended field present (u16, kJ)
 *       bit 4: RR-interval field present (one or more u16, 1/1024 s)
 *   - byte 1+: HR value (1 or 2 bytes, LE)
 *   - (optional) energy expended (2 bytes, LE)
 *   - (optional) RR intervals (2 bytes each, LE)
 */
function parseHrm(data: DataView): HrmReading {
  const flags = data.getUint8(0);
  const isU16 = (flags & 0x01) !== 0;
  const energyPresent = (flags & 0x08) !== 0;
  const rrPresent = (flags & 0x10) !== 0;
  const contactSupported = (flags & 0x04) !== 0;
  const contact = contactSupported ? (flags & 0x02) !== 0 : undefined;

  let offset = 1;
  const bpm = isU16
    ? data.getUint16(offset, true)
    : data.getUint8(offset);
  offset += isU16 ? 2 : 1;

  if (energyPresent) offset += 2;

  const rrMs: number[] = [];
  if (rrPresent) {
    while (offset + 1 < data.byteLength) {
      // 1/1024 s units → ms
      rrMs.push((data.getUint16(offset, true) * 1000) / 1024);
      offset += 2;
    }
  }

  return { bpm, rrMs, contact };
}

export const HRM_ADAPTER: SensorAdapter<HrmReading> = {
  kind: 'HRM',
  name: 'Heart Rate Monitor',
  serviceUuid: SERVICE_UUIDS.HEART_RATE,
  measurementCharacteristic: CHARACTERISTIC_UUIDS.HEART_RATE_MEASUREMENT,
  parse: parseHrm,
};
