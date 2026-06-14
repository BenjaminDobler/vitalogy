import { Injectable, signal } from '@angular/core';
import { UploadQueue, type RecordingSession } from 'recording';

/**
 * No-op UploadQueue for the simulator. Recordings made in the simulator
 * are dev exercises, not real rides — keep them out of the DB.
 *
 * Logs to the console so you can still inspect what would have been uploaded.
 */
@Injectable({ providedIn: 'root' })
export class NoopUploadQueue extends UploadQueue {
  override readonly pending = signal<never[]>([]);
  override readonly uploading = signal(false);
  override readonly lastError = signal<string | null>(null);

  override async enqueue(session: RecordingSession): Promise<void> {
    console.info('[simulator] session "stopped" — not uploading:', session);
  }

  override async flush(): Promise<void> {
    /* no-op */
  }

  override async drop(_sessionId: string): Promise<void> {
    /* no-op */
  }
}
