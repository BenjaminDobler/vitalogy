import { inject, Injectable, signal } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { RecordingService } from './recording.service';

/**
 * Wraps @capacitor/geolocation as a high-accuracy GPS watcher and feeds
 * positions into RecordingService.pushLocation().
 *
 * Lifecycle is tied to the recording session — caller invokes start() right
 * before recording.start() and stop() after recording.stop().
 *
 * iOS requires `NSLocationWhenInUseUsageDescription` in Info.plist.
 * Background recording also needs the `location` background mode.
 * Android: ACCESS_FINE_LOCATION + ACCESS_COARSE_LOCATION (auto-declared by
 * the plugin).
 */
@Injectable({ providedIn: 'root' })
export class GpsTracker {
  private readonly recording = inject(RecordingService);

  readonly active = signal(false);
  readonly lastError = signal<string | null>(null);

  private watchId?: string;

  async start(): Promise<void> {
    this.lastError.set(null);
    try {
      const perm = await Geolocation.requestPermissions({
        permissions: ['location'],
      });
      if (perm.location !== 'granted') {
        this.lastError.set('Location permission denied');
        return;
      }
      this.watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 30_000, maximumAge: 1_000 },
        (position, err) => {
          if (err) {
            this.lastError.set(err.message ?? String(err));
            return;
          }
          if (!position) return;
          this.recording.pushLocation(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.altitude ?? undefined,
          );
        },
      );
      this.active.set(true);
    } catch (err) {
      this.lastError.set(toMessage(err));
    }
  }

  async stop(): Promise<void> {
    if (this.watchId) {
      try {
        await Geolocation.clearWatch({ id: this.watchId });
      } catch {
        // Already cleared / app exit — fine.
      }
      this.watchId = undefined;
    }
    this.active.set(false);
  }
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
