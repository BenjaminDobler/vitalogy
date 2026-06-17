import { Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

const KEY_TOKEN = 'vitalogy.auth.token';
const KEY_EMAIL = 'vitalogy.auth.email';
const KEY_NAME = 'vitalogy.auth.name';
const KEY_USER_ID = 'vitalogy.auth.userId';

export interface AuthSession {
  userId: string;
  email: string;
  name: string | null;
  token: string;
}

/**
 * Holds the Bearer-token session the mobile app uses to talk to the API
 * after the rider paired (QR scan or future email/password login) or
 * Sign in with Apple.
 *
 * Persists to Capacitor Preferences so the session survives app
 * restarts. ApiClient reads `token()` on every request to populate the
 * Authorization header.
 */
@Injectable({ providedIn: 'root' })
export class MobileAuthService {
  /** Current Bearer token, or null when not signed in. */
  readonly token = signal<string | null>(null);
  /** Email + display name for the signed-in user, when available. */
  readonly email = signal<string | null>(null);
  readonly name = signal<string | null>(null);
  /** Server-issued user id (cuid). Used as X-User-Id fallback. */
  readonly userId = signal<string | null>(null);
  /** True once we've finished loading from Preferences on app start. */
  readonly ready = signal(false);

  constructor() {
    void this.load();
  }

  async setSession(session: AuthSession): Promise<void> {
    this.token.set(session.token);
    this.email.set(session.email);
    this.name.set(session.name);
    this.userId.set(session.userId);
    await Promise.all([
      Preferences.set({ key: KEY_TOKEN, value: session.token }),
      Preferences.set({ key: KEY_EMAIL, value: session.email }),
      Preferences.set({ key: KEY_NAME, value: session.name ?? '' }),
      Preferences.set({ key: KEY_USER_ID, value: session.userId }),
    ]);
  }

  async clear(): Promise<void> {
    this.token.set(null);
    this.email.set(null);
    this.name.set(null);
    this.userId.set(null);
    await Promise.all([
      Preferences.remove({ key: KEY_TOKEN }),
      Preferences.remove({ key: KEY_EMAIL }),
      Preferences.remove({ key: KEY_NAME }),
      Preferences.remove({ key: KEY_USER_ID }),
    ]);
  }

  private async load(): Promise<void> {
    try {
      const [token, email, name, userId] = await Promise.all([
        Preferences.get({ key: KEY_TOKEN }),
        Preferences.get({ key: KEY_EMAIL }),
        Preferences.get({ key: KEY_NAME }),
        Preferences.get({ key: KEY_USER_ID }),
      ]);
      if (token.value) this.token.set(token.value);
      if (email.value) this.email.set(email.value);
      if (name.value) this.name.set(name.value || null);
      if (userId.value) this.userId.set(userId.value);
    } finally {
      this.ready.set(true);
    }
  }
}
