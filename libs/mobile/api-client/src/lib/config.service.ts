import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const KEY_BASE_URL = 'vitalogy.apiBaseUrl';
const KEY_USER_ID = 'vitalogy.userId';
const KEY_DEV_MODE = 'vitalogy.devMode';
const KEY_AUTO_PAUSE = 'vitalogy.autoPauseEnabled';
const KEY_AUTO_PAUSE_THRESHOLD = 'vitalogy.autoPauseThresholdKmh';
const KEY_AUTO_PAUSE_DELAY = 'vitalogy.autoPauseDelaySec';
const KEY_RECORD_TILES = 'vitalogy.recordTiles';
const KEY_RECORD_LAYOUT = 'vitalogy.recordLayout';

/** Default backend user id. Matches DEFAULT_USER_ID on the API side. */
export const DEFAULT_USER_ID = 'dev-user';

export type RecordTile =
  | 'hr'
  | 'cadence'
  | 'speed'
  | 'distance'
  | 'lap-time'
  | 'total-time'
  | 'avg-speed'
  | 'avg-hr';

export const ALL_RECORD_TILES: { id: RecordTile; label: string }[] = [
  { id: 'hr', label: 'Heart rate' },
  { id: 'cadence', label: 'Cadence' },
  { id: 'speed', label: 'Speed' },
  { id: 'distance', label: 'Distance' },
  { id: 'lap-time', label: 'Lap time' },
  { id: 'total-time', label: 'Total time' },
  { id: 'avg-speed', label: 'Avg speed' },
  { id: 'avg-hr', label: 'Avg HR' },
];

const DEFAULT_TILES: RecordTile[] = ['hr', 'cadence', 'speed', 'distance'];

export type RecordLayout = 'two-col' | 'one-col';

/**
 * Persistent app config. Stored via @capacitor/preferences (durable on iOS,
 * localStorage in the browser preview).
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  readonly apiBaseUrl = signal<string>('');
  readonly userId = signal<string>(DEFAULT_USER_ID);

  /** When true, the record screen feeds itself simulated sensor/GPS/weather data. */
  readonly devMode = signal<boolean>(false);

  /** Auto-pause: pause the timer when speed sits below the threshold for delay seconds. */
  readonly autoPauseEnabled = signal<boolean>(true);
  readonly autoPauseThresholdKmh = signal<number>(2);
  readonly autoPauseDelaySec = signal<number>(8);

  /** Which metric tiles to show during recording, in display order. */
  readonly recordTiles = signal<RecordTile[]>(DEFAULT_TILES);
  /** Tile layout — 2 columns (default) or single-column "big" mode for handlebar legibility. */
  readonly recordLayout = signal<RecordLayout>('two-col');

  /** True once saved values have been loaded from Preferences. */
  readonly ready = signal(false);

  constructor() {
    void this.load();
  }

  async setApiBaseUrl(url: string): Promise<void> {
    const trimmed = url.trim().replace(/\/+$/, '');
    this.apiBaseUrl.set(trimmed);
    await Preferences.set({ key: KEY_BASE_URL, value: trimmed });
  }

  async setUserId(id: string): Promise<void> {
    const trimmed = id.trim() || DEFAULT_USER_ID;
    this.userId.set(trimmed);
    await Preferences.set({ key: KEY_USER_ID, value: trimmed });
  }

  async setDevMode(on: boolean): Promise<void> {
    this.devMode.set(on);
    await Preferences.set({ key: KEY_DEV_MODE, value: on ? '1' : '0' });
  }

  async setAutoPauseEnabled(on: boolean): Promise<void> {
    this.autoPauseEnabled.set(on);
    await Preferences.set({ key: KEY_AUTO_PAUSE, value: on ? '1' : '0' });
  }

  async setAutoPauseThresholdKmh(v: number): Promise<void> {
    this.autoPauseThresholdKmh.set(v);
    await Preferences.set({ key: KEY_AUTO_PAUSE_THRESHOLD, value: String(v) });
  }

  async setAutoPauseDelaySec(v: number): Promise<void> {
    this.autoPauseDelaySec.set(v);
    await Preferences.set({ key: KEY_AUTO_PAUSE_DELAY, value: String(v) });
  }

  async setRecordTiles(tiles: RecordTile[]): Promise<void> {
    this.recordTiles.set(tiles);
    await Preferences.set({ key: KEY_RECORD_TILES, value: JSON.stringify(tiles) });
  }

  async setRecordLayout(layout: RecordLayout): Promise<void> {
    this.recordLayout.set(layout);
    await Preferences.set({ key: KEY_RECORD_LAYOUT, value: layout });
  }

  private async load(): Promise<void> {
    try {
      const keys = [
        KEY_BASE_URL,
        KEY_USER_ID,
        KEY_DEV_MODE,
        KEY_AUTO_PAUSE,
        KEY_AUTO_PAUSE_THRESHOLD,
        KEY_AUTO_PAUSE_DELAY,
        KEY_RECORD_TILES,
        KEY_RECORD_LAYOUT,
      ];
      const results = await Promise.all(keys.map((k) => Preferences.get({ key: k })));
      const [baseUrl, userId, devMode, autoPause, threshold, delay, tiles, layout] = results;
      if (baseUrl.value) this.apiBaseUrl.set(baseUrl.value);
      if (userId.value) this.userId.set(userId.value);
      if (devMode.value === '1') this.devMode.set(true);
      if (autoPause.value === '0') this.autoPauseEnabled.set(false);
      if (threshold.value) this.autoPauseThresholdKmh.set(Number(threshold.value));
      if (delay.value) this.autoPauseDelaySec.set(Number(delay.value));
      if (tiles.value) {
        try {
          const parsed = JSON.parse(tiles.value) as RecordTile[];
          if (Array.isArray(parsed) && parsed.length > 0) this.recordTiles.set(parsed);
        } catch {
          /* ignore corrupt JSON */
        }
      }
      if (layout.value === 'one-col' || layout.value === 'two-col') {
        this.recordLayout.set(layout.value);
      }
    } finally {
      this.ready.set(true);
    }
  }
}
