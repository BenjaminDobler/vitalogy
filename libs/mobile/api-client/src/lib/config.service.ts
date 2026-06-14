import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const KEY_BASE_URL = 'vitalogy.apiBaseUrl';
const KEY_USER_ID = 'vitalogy.userId';

/** Default backend user id. Matches DEFAULT_USER_ID on the API side. */
export const DEFAULT_USER_ID = 'dev-user';

/**
 * Persistent app config:
 *  - apiBaseUrl: full URL to the Vitalogy API, e.g. `http://192.168.1.42:3000`.
 *    Empty means no upload target is set yet — recordings get queued locally.
 *  - userId: identity sent in the `X-User-Id` header. Defaults to `dev-user`
 *    so mobile rides land in the same namespace as the web's Strava imports.
 *    Override only if you want a separate namespace per install/device.
 *
 * Stored via @capacitor/preferences which is durable across reinstalls on
 * iOS (kept in iCloud keychain) and across launches on web (localStorage).
 */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  readonly apiBaseUrl = signal<string>('');
  readonly userId = signal<string>(DEFAULT_USER_ID);
  /** True once the saved values have been loaded from Preferences. */
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

  private async load(): Promise<void> {
    try {
      const [baseUrl, userId] = await Promise.all([
        Preferences.get({ key: KEY_BASE_URL }),
        Preferences.get({ key: KEY_USER_ID }),
      ]);
      if (baseUrl.value) this.apiBaseUrl.set(baseUrl.value);
      if (userId.value) this.userId.set(userId.value);
    } finally {
      this.ready.set(true);
    }
  }
}
