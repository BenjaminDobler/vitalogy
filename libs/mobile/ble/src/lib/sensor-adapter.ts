/**
 * Standard Bluetooth Low Energy services we care about for cycling.
 * The Capacitor plugin uses full 128-bit UUID strings; the constants below
 * are the canonical lowercase form.
 */

export const SERVICE_UUIDS = {
  HEART_RATE: '0000180d-0000-1000-8000-00805f9b34fb',
  CYCLING_SPEED_CADENCE: '00001816-0000-1000-8000-00805f9b34fb',
  CYCLING_POWER: '00001818-0000-1000-8000-00805f9b34fb',
  BATTERY: '0000180f-0000-1000-8000-00805f9b34fb',
} as const;

export const CHARACTERISTIC_UUIDS = {
  HEART_RATE_MEASUREMENT: '00002a37-0000-1000-8000-00805f9b34fb',
  CSC_MEASUREMENT: '00002a5b-0000-1000-8000-00805f9b34fb',
  CYCLING_POWER_MEASUREMENT: '00002a63-0000-1000-8000-00805f9b34fb',
  BATTERY_LEVEL: '00002a19-0000-1000-8000-00805f9b34fb',
} as const;

export type SensorKind = 'HRM' | 'CSC' | 'POWER' | 'BATTERY';

/**
 * A SensorAdapter binds a BLE service + characteristic to a parser. Adding a
 * new sensor type (power meter, trainer, Di2 shifters, etc.) is a matter of
 * implementing this interface and registering it with BleManager.
 */
export interface SensorAdapter<TReading> {
  readonly kind: SensorKind;
  /** Human-readable name shown in the UI. */
  readonly name: string;
  /** Service the device advertises and we filter scans by. */
  readonly serviceUuid: string;
  /** Notification characteristic we subscribe to. */
  readonly measurementCharacteristic: string;
  parse(data: DataView): TReading;
}

/** A single decoded reading flowing through BleManager.readings$. */
export interface BleReading<T = unknown> {
  /** Sensor type. */
  kind: SensorKind;
  /** Source device id (so multiple sensors of the same kind don't collide). */
  deviceId: string;
  /** Receive timestamp on the phone (ms since epoch). */
  receivedAt: number;
  /** Decoded payload — type depends on `kind`. */
  data: T;
}

/** Modular unsigned 16-bit difference: (curr - prev) mod 2^16. */
export function u16Diff(curr: number, prev: number): number {
  return (curr - prev + 0x10000) & 0xffff;
}

/** Modular unsigned 32-bit difference: (curr - prev) mod 2^32. */
export function u32Diff(curr: number, prev: number): number {
  return (curr - prev + 0x1_0000_0000) >>> 0;
}
