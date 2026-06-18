import { Injectable, effect, inject } from '@angular/core';
import { RecordingService } from './recording.service';

/**
 * Keeps the screen on while a recording session is in progress. Uses
 * the standard Wake Lock API (`navigator.wakeLock.request('screen')`)
 * which is supported in the iOS WKWebView from iOS 16.4 and on
 * Android Chrome — both targets Capacitor 8 ships against.
 *
 * Behavior:
 *   - As soon as RecordingService.session() goes non-null, request a
 *     screen lock. Browser keeps the lock until we explicitly release
 *     OR the page becomes invisible.
 *   - When the page is hidden (rider locks the phone, switches apps),
 *     the browser silently releases the lock. On visibilitychange =
 *     'visible' we re-request if recording is still active.
 *   - On stop, release the lock.
 *
 * Failures are silent — wake lock is a nice-to-have. Devices that
 * don't support it (very old Android, web on desktop) just fall back
 * to the OS's normal screen timeout.
 */
@Injectable({ providedIn: 'root' })
export class ScreenWakeService {
  private readonly recording = inject(RecordingService);

  /** Active wake lock sentinel, or null when no lock is held. */
  private sentinel: WakeLockSentinel | null = null;

  constructor() {
    // Tie the lock lifecycle to recording session presence.
    effect(() => {
      const session = this.recording.session();
      if (session) {
        void this.acquire();
      } else {
        void this.release();
      }
    });

    // Browsers automatically drop wake locks when the page is hidden
    // (rider taps the lock button, switches to another app). Re-acquire
    // on return so the screen-on guarantee is restored once the rider
    // foregrounds the app again.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (
          document.visibilityState === 'visible' &&
          this.recording.session()
        ) {
          void this.acquire();
        }
      });
    }
  }

  private async acquire(): Promise<void> {
    if (this.sentinel || typeof navigator === 'undefined') return;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLock })
      .wakeLock;
    if (!wakeLock) return;
    try {
      this.sentinel = await wakeLock.request('screen');
      // Listen for browser-initiated release (e.g. tab background)
      // so our local reference stays accurate.
      this.sentinel.addEventListener('release', () => {
        this.sentinel = null;
      });
    } catch {
      // Common: NotAllowedError before any user gesture, or
      // SecurityError on insecure contexts. Silent — wake lock is a
      // soft guarantee.
      this.sentinel = null;
    }
  }

  private async release(): Promise<void> {
    if (!this.sentinel) return;
    try {
      await this.sentinel.release();
    } catch {
      /* already released */
    }
    this.sentinel = null;
  }
}

/**
 * Minimal Wake Lock API type declarations — TypeScript's lib.dom isn't
 * always up-to-date on these. Declared inline to avoid pulling in a
 * separate @types package.
 */
interface WakeLock {
  request(type: 'screen'): Promise<WakeLockSentinel>;
}
interface WakeLockSentinel extends EventTarget {
  release(): Promise<void>;
}
