import { Injectable, signal } from '@angular/core';
import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';
import { Subject } from 'rxjs';
import { BATTERY_ADAPTER, BatteryReading } from './battery-adapter';
import { CSC_ADAPTER, CscRaw, CscReading, CscTracker } from './csc-adapter';
import { HRM_ADAPTER, HrmReading } from './hrm-adapter';
import {
  BleReading,
  SensorAdapter,
  SensorKind,
  SERVICE_UUIDS,
} from './sensor-adapter';

export interface DiscoveredSensor {
  deviceId: string;
  name?: string;
  rssi?: number;
  /** Adapter kinds that match this device's advertised services. */
  kinds: SensorKind[];
}

export interface ConnectedSensor {
  deviceId: string;
  name?: string;
  /** Adapters we've subscribed to for this device. */
  subscribed: SensorKind[];
  /** CSC stateful tracker, lazily created when the first CSC packet arrives. */
  cscTracker?: CscTracker;
}

const ALL_ADAPTERS: SensorAdapter<unknown>[] = [
  HRM_ADAPTER as SensorAdapter<unknown>,
  CSC_ADAPTER as SensorAdapter<unknown>,
  BATTERY_ADAPTER as SensorAdapter<unknown>,
];

function adapterFor(kind: SensorKind): SensorAdapter<unknown> {
  const a = ALL_ADAPTERS.find((x) => x.kind === kind);
  if (!a) throw new Error(`Unknown sensor kind: ${kind}`);
  return a;
}

/**
 * Single facade over @capacitor-community/bluetooth-le for cycling sensors.
 *
 *   await bleManager.initialize();
 *   const found = await bleManager.scan(['HRM', 'CSC'], 5000);
 *   await bleManager.connect(found[0].deviceId);
 *   await bleManager.subscribe(found[0].deviceId, 'HRM');
 *   bleManager.readings$.subscribe(r => console.log(r));
 */
@Injectable({ providedIn: 'root' })
export class BleManager {
  readonly readings$ = new Subject<BleReading>();
  readonly connected = signal<ConnectedSensor[]>([]);
  readonly scanning = signal(false);
  readonly initialized = signal(false);

  async initialize(): Promise<void> {
    if (this.initialized()) return;
    // On Android this triggers the runtime permission prompts.
    await BleClient.initialize({ androidNeverForLocation: true });
    this.initialized.set(true);
  }

  /**
   * Scan for sensors of the requested kinds for `durationMs`. Returns a
   * deduplicated list with the highest RSSI seen per device.
   */
  async scan(kinds: SensorKind[], durationMs = 5000): Promise<DiscoveredSensor[]> {
    await this.initialize();
    const wantedServices = kinds
      .map((k) => adapterFor(k).serviceUuid)
      .filter((s, i, a) => a.indexOf(s) === i);

    const seen = new Map<string, DiscoveredSensor>();
    this.scanning.set(true);
    try {
      await BleClient.requestLEScan(
        { services: wantedServices, allowDuplicates: false },
        (result) => {
          const sensor = this.toDiscovered(result, kinds);
          const existing = seen.get(sensor.deviceId);
          if (!existing || (sensor.rssi ?? -999) > (existing.rssi ?? -999)) {
            seen.set(sensor.deviceId, sensor);
          }
        },
      );
      await new Promise((r) => setTimeout(r, durationMs));
    } finally {
      await BleClient.stopLEScan();
      this.scanning.set(false);
    }
    return [...seen.values()];
  }

  async connect(deviceId: string, displayName?: string): Promise<void> {
    await BleClient.connect(deviceId, (id) => this.onDisconnect(id));
    this.connected.update((list) =>
      list.some((c) => c.deviceId === deviceId)
        ? list
        : [...list, { deviceId, name: displayName, subscribed: [] }],
    );
  }

  async disconnect(deviceId: string): Promise<void> {
    try {
      await BleClient.disconnect(deviceId);
    } finally {
      this.onDisconnect(deviceId);
    }
  }

  /** Subscribe to a kind's notifications on an already-connected device. */
  async subscribe(deviceId: string, kind: SensorKind): Promise<void> {
    const adapter = adapterFor(kind);
    await BleClient.startNotifications(
      deviceId,
      adapter.serviceUuid,
      adapter.measurementCharacteristic,
      (value) => this.handleNotification(deviceId, kind, value),
    );
    this.connected.update((list) =>
      list.map((c) =>
        c.deviceId === deviceId
          ? { ...c, subscribed: addUnique(c.subscribed, kind) }
          : c,
      ),
    );
  }

  /** One-shot read of the Battery Level characteristic (no subscription). */
  async readBattery(deviceId: string): Promise<number | null> {
    try {
      const value = await BleClient.read(
        deviceId,
        BATTERY_ADAPTER.serviceUuid,
        BATTERY_ADAPTER.measurementCharacteristic,
      );
      return BATTERY_ADAPTER.parse(value);
    } catch {
      return null;
    }
  }

  private handleNotification(
    deviceId: string,
    kind: SensorKind,
    value: DataView,
  ): void {
    const receivedAt = Date.now();
    const adapter = adapterFor(kind);
    const parsed = adapter.parse(value);

    // CSC needs cross-packet state to compute rpm + m/s.
    if (kind === 'CSC') {
      let tracker: CscTracker | undefined;
      this.connected.update((list) =>
        list.map((c) => {
          if (c.deviceId !== deviceId) return c;
          if (!c.cscTracker) c.cscTracker = new CscTracker();
          tracker = c.cscTracker;
          return c;
        }),
      );
      const reading: CscReading = tracker
        ? tracker.update(parsed as CscRaw)
        : {};
      this.readings$.next({ kind, deviceId, receivedAt, data: reading });
      return;
    }

    if (kind === 'HRM') {
      this.readings$.next({
        kind,
        deviceId,
        receivedAt,
        data: parsed as HrmReading,
      });
      return;
    }

    if (kind === 'BATTERY') {
      this.readings$.next({
        kind,
        deviceId,
        receivedAt,
        data: parsed as BatteryReading,
      });
      return;
    }
  }

  private onDisconnect(deviceId: string): void {
    this.connected.update((list) => list.filter((c) => c.deviceId !== deviceId));
  }

  private toDiscovered(result: ScanResult, requested: SensorKind[]): DiscoveredSensor {
    const advertised = (result.uuids ?? []).map((s) => s.toLowerCase());
    const kinds = requested.filter((k) =>
      advertised.includes(adapterFor(k).serviceUuid),
    );
    // If the advertising packet didn't include the service UUID (some sensors
    // only expose it in the scan response), fall back to the requested filter set.
    const finalKinds = kinds.length > 0 ? kinds : requested;
    return {
      deviceId: result.device.deviceId,
      name: result.device.name ?? result.localName,
      rssi: result.rssi,
      kinds: finalKinds,
    };
  }
}

function addUnique<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr : [...arr, item];
}

// Mirror service-UUID constants here so callers don't have to import from two places.
export { SERVICE_UUIDS };
