import { inject, Injectable, signal } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { ApiClient } from 'api-client';
import type {
  UploadActivityRequest,
  UploadActivityResponse,
} from 'data-models';
import { RecordingSession } from './recording-types';

const STORAGE_KEY = 'vitalogy.uploadQueue';

export interface QueuedItem {
  session: RecordingSession;
  enqueuedAt: number;
}

/**
 * Reliable, offline-tolerant upload of finished RecordingSession objects.
 *
 *   - enqueue(session) appends to a Capacitor Preferences-backed list and
 *     triggers flush() immediately.
 *   - flush() walks the queue in order; stops on the first failure so we
 *     don't retry-storm a broken backend.
 *   - The next flush gets triggered when the user reopens Settings, taps
 *     the pending-uploads banner, or calls flush() manually.
 *
 * Idempotency lives on the backend (Activity is keyed on
 * source: 'MANUAL', sourceId: sessionId), so a successful upload + lost
 * 200 response → next retry → 200 with `alreadyExisted: true` and we drop
 * the item cleanly.
 */
@Injectable({ providedIn: 'root' })
export class UploadQueue {
  private readonly api = inject(ApiClient);

  readonly pending = signal<QueuedItem[]>([]);
  readonly uploading = signal(false);
  readonly lastError = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  /** Add a session to the queue and try to push it immediately. */
  async enqueue(session: RecordingSession): Promise<void> {
    this.pending.update((list) => [...list, { session, enqueuedAt: Date.now() }]);
    await this.persist();
    void this.flush();
  }

  /**
   * Try to upload everything currently queued. Returns when either the queue
   * is empty or an upload fails — caller can retry later.
   */
  async flush(): Promise<void> {
    if (this.uploading()) return;
    if (this.pending().length === 0) return;
    if (!this.api.isConfigured()) {
      this.lastError.set('No API base URL configured.');
      return;
    }

    this.uploading.set(true);
    this.lastError.set(null);
    try {
      while (this.pending().length > 0) {
        const head = this.pending()[0];
        try {
          await this.uploadOne(head.session);
          this.pending.update((list) => list.slice(1));
          await this.persist();
        } catch (err) {
          this.lastError.set(toMessage(err));
          break;
        }
      }
    } finally {
      this.uploading.set(false);
    }
  }

  /** Drop a queued session without uploading. */
  async drop(sessionId: string): Promise<void> {
    this.pending.update((list) => list.filter((q) => q.session.id !== sessionId));
    await this.persist();
  }

  private async uploadOne(session: RecordingSession): Promise<void> {
    const req: UploadActivityRequest = {
      sessionId: session.id,
      startedAt: new Date(session.startedAt).toISOString(),
      endedAt: new Date(session.endedAt ?? Date.now()).toISOString(),
      samples: session.samples,
      lapSplits: session.lapSplits,
      weather: session.weather ?? undefined,
      workoutId: session.workout?.id,
    };
    await this.api.post<UploadActivityResponse>('/api/activities', req);
  }

  private async load(): Promise<void> {
    try {
      const raw = await Preferences.get({ key: STORAGE_KEY });
      if (!raw.value) return;
      const parsed = JSON.parse(raw.value) as QueuedItem[];
      if (Array.isArray(parsed)) this.pending.set(parsed);
    } catch {
      // Corrupt or unavailable storage — start fresh.
    }
  }

  private async persist(): Promise<void> {
    try {
      await Preferences.set({
        key: STORAGE_KEY,
        value: JSON.stringify(this.pending()),
      });
    } catch {
      // iOS storage full / privacy mode — silently drop.
    }
  }
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
