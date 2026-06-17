import { inject, Injectable, signal } from '@angular/core';
import type { RideView } from 'data-models';
import { ApiClient } from './api-client.service';

const CACHE_KEY = 'vitalogy.rideViews.v1';

/**
 * Mobile-side ride-views client. The web app owns creation/editing —
 * this client only reads the list so the ride screen can render the
 * user's chosen carousel.
 *
 * Caching: the most recently fetched list is mirrored to localStorage
 * so an offline ride still picks up the user's configured layout. On
 * construction we synchronously hydrate from cache (no network latency
 * before the first paint), then kick off an async refresh in the
 * background. A network error during refresh leaves the cached value
 * in place — better stale-but-shown than missing.
 *
 * The signal is the source of truth for the ride screen. When it
 * comes back empty (first launch, never connected) the screen falls
 * back to its built-in default layouts.
 */
@Injectable({ providedIn: 'root' })
export class RideViewsService {
  private readonly api = inject(ApiClient);

  readonly views = signal<RideView[]>(loadFromCache());
  readonly loading = signal(false);
  readonly lastError = signal<string | null>(null);

  constructor() {
    void this.refresh();
  }

  /**
   * Re-fetch from the backend. Idempotent; safe to call on app resume.
   * Updates `views` + the localStorage mirror on success.
   */
  async refresh(): Promise<void> {
    if (!this.api.isConfigured()) {
      // No backend bound (e.g. simulator). Keep whatever the cache had.
      return;
    }
    this.loading.set(true);
    this.lastError.set(null);
    try {
      const list = await this.api.get<RideView[]>('/api/ride-views');
      this.views.set(list);
      saveToCache(list);
    } catch (err) {
      this.lastError.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.set(false);
    }
  }
}

function loadFromCache(): RideView[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RideView[]) : [];
  } catch {
    return [];
  }
}

function saveToCache(list: RideView[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    // Quota / private mode — silent. The in-memory signal still has
    // the freshly fetched data for this session.
  }
}
