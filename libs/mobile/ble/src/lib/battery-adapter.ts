import {
  CHARACTERISTIC_UUIDS,
  SERVICE_UUIDS,
  SensorAdapter,
} from './sensor-adapter';

/** Battery Level (0x2A19) is a single u8: percentage 0-100. */
export type BatteryReading = number;

export const BATTERY_ADAPTER: SensorAdapter<BatteryReading> = {
  kind: 'BATTERY',
  name: 'Battery',
  serviceUuid: SERVICE_UUIDS.BATTERY,
  measurementCharacteristic: CHARACTERISTIC_UUIDS.BATTERY_LEVEL,
  parse: (data) => data.getUint8(0),
};
