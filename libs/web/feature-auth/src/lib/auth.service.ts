import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

/**
 * Web-side session state. Hydrated once at app start by calling
 * GET /api/auth/me; subsequent login/signup mutations set the user
 * directly so the rest of the UI reacts immediately without a
 * round-trip.
 *
 * `ready` flips true after the initial hydrate so guards can wait until
 * we know whether the user is logged in or not before deciding to
 * redirect.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _user = signal<AuthUser | null>(null);
  private readonly _ready = signal(false);

  readonly user = this._user.asReadonly();
  readonly ready = this._ready.asReadonly();
  readonly isAuthenticated = computed(() => this._user() != null);

  /** Called once from app init. */
  async hydrate(): Promise<void> {
    try {
      const u = await firstValueFrom(
        this.http.get<AuthUser | null>('/api/auth/me'),
      );
      this._user.set(u);
    } catch {
      this._user.set(null);
    } finally {
      this._ready.set(true);
    }
  }

  async signup(input: {
    email: string;
    password: string;
    name?: string;
  }): Promise<AuthUser> {
    const u = await firstValueFrom(
      this.http.post<AuthUser>('/api/auth/signup', input),
    );
    this._user.set(u);
    return u;
  }

  async login(input: { email: string; password: string }): Promise<AuthUser> {
    const u = await firstValueFrom(
      this.http.post<AuthUser>('/api/auth/login', input),
    );
    this._user.set(u);
    return u;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } finally {
      this._user.set(null);
    }
  }
}
