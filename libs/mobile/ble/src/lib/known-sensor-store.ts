import { Injectable, signal } from '@angular/core';
import { SensorKind } from './sensor-adapter';

export interface KnownSensor {
  deviceId: string;
  name?: string;
  kinds: SensorKind[];
  /** Last time we successfully connected to this sensor (ms since epoch). */
  lastConnectedAt: number;
}

const STORAGE_KEY = 'vitalogy.known-sensors';

/**
 * Persists previously-connected sensors so the user can one-tap reconnect
 * after walking away from the bike. Backed by localStorage — works in both
 * the WebView (Capacitor preserves localStorage across launches) and the
 * browser preview.
 */
@Injectable({ providedIn: 'root' })
export class KnownSensorStore {
  readonly known = signal<KnownSensor[]>([]);

  constructor() {
    this.load();
  }

  /**
   * Save a sensor we just connected (or update its `lastConnectedAt` + merge
   * any new capabilities discovered during this connection).
   */
  remember(sensor: { deviceId: string; name?: string; kinds: SensorKind[] }): void {
    const list = this.known();
    const existing = list.find((k) => k.deviceId === sensor.deviceId);
    const merged: KnownSensor = {
      deviceId: sensor.deviceId,
      name: sensor.name ?? existing?.name,
      kinds: dedupe([...(existing?.kinds ?? []), ...sensor.kinds]),
      lastConnectedAt: Date.now(),
    };
    const others = list.filter((k) => k.deviceId !== sensor.deviceId);
    const next = [merged, ...others].sort(
      (a, b) => b.lastConnectedAt - a.lastConnectedAt,
    );
    this.known.set(next);
    this.persist();
  }

  forget(deviceId: string): void {
    this.known.update((list) => list.filter((k) => k.deviceId !== deviceId));
    this.persist();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as KnownSensor[];
      if (Array.isArray(parsed)) this.known.set(parsed);
    } catch {
      // Corrupt or unavailable — ignore, start fresh.
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.known()));
    } catch {
      // Storage quota / privacy mode — silently drop.
    }
  }
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
