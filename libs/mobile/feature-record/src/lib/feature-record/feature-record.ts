import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import {
  BleManager,
  DiscoveredSensor,
} from 'ble';
import { RecordingService } from 'recording';

/**
 * Single-screen MVP: scan → connect → live readings → record / stop.
 *
 * Designed for one-handed use on a phone propped on the handlebars. Big tiles,
 * minimum touch targets, no nested navigation.
 */
@Component({
  selector: 'lib-feature-record',
  imports: [DecimalPipe],
  template: `
    <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header class="px-5 pt-6 pb-4 flex items-baseline justify-between">
        <h1 class="text-xl font-semibold">Record</h1>
        @if (!recording()) {
          <button
            (click)="scan()"
            [disabled]="scanning()"
            class="text-sm px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
          >
            {{ scanning() ? 'Scanning…' : 'Scan' }}
          </button>
        }
      </header>

      @if (errorMsg(); as msg) {
        <p class="mx-5 mb-3 text-sm text-rose-400">{{ msg }}</p>
      }

      @if (!recording()) {
        <section class="px-5 pb-4">
          <h2 class="text-xs uppercase tracking-wider text-slate-500 mb-2">
            Connected
          </h2>
          @if (connected().length === 0) {
            <p class="text-sm text-slate-400">
              No sensors yet. Tap <em>Scan</em> to find your TICKR + Blue SC.
            </p>
          } @else {
            <ul class="space-y-1.5">
              @for (c of connected(); track c.deviceId) {
                <li class="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2">
                  <div>
                    <div class="text-sm font-medium">
                      {{ c.name ?? c.deviceId }}
                    </div>
                    <div class="text-xs text-slate-500">
                      {{ c.subscribed.join(' · ') || 'connected, not subscribed' }}
                    </div>
                  </div>
                  <button
                    (click)="disconnect(c.deviceId)"
                    class="text-xs px-2 py-1 rounded-md text-rose-400 hover:bg-slate-800"
                  >
                    Disconnect
                  </button>
                </li>
              }
            </ul>
          }
        </section>

        @if (newlyDiscovered().length > 0) {
          <section class="px-5 pb-4">
            <h2 class="text-xs uppercase tracking-wider text-slate-500 mb-2">
              Discovered
            </h2>
            <ul class="space-y-1.5">
              @for (d of newlyDiscovered(); track d.deviceId) {
                <li class="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2">
                  <div>
                    <div class="text-sm font-medium">
                      {{ d.name ?? '(unnamed)' }}
                    </div>
                    <div class="text-xs text-slate-500">
                      {{ d.kinds.join(', ') }}
                      @if (d.rssi != null) {
                        · {{ d.rssi }} dBm
                      }
                    </div>
                  </div>
                  <button
                    (click)="connect(d)"
                    [disabled]="connecting() === d.deviceId"
                    class="text-xs px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {{ connecting() === d.deviceId ? '…' : 'Connect' }}
                  </button>
                </li>
              }
            </ul>
          </section>
        }
      }

      @if (connected().length > 0) {
        <section class="px-5 pb-6 grid grid-cols-2 gap-3 mt-auto">
          <div class="rounded-xl bg-slate-900 p-4">
            <div class="text-[10px] uppercase tracking-wider text-rose-400">
              Heart rate
            </div>
            <div class="text-4xl font-bold tabular-nums mt-1">
              {{ heartRate() ?? '—' }}
              <span class="text-sm text-slate-500 font-normal">bpm</span>
            </div>
          </div>
          <div class="rounded-xl bg-slate-900 p-4">
            <div class="text-[10px] uppercase tracking-wider text-amber-400">
              Cadence
            </div>
            <div class="text-4xl font-bold tabular-nums mt-1">
              {{ (cadence() ?? 0) | number: '1.0-0' }}
              <span class="text-sm text-slate-500 font-normal">rpm</span>
            </div>
          </div>
          <div class="rounded-xl bg-slate-900 p-4">
            <div class="text-[10px] uppercase tracking-wider text-sky-400">
              Speed
            </div>
            <div class="text-4xl font-bold tabular-nums mt-1">
              {{ (speedKmh() ?? 0) | number: '1.1-1' }}
              <span class="text-sm text-slate-500 font-normal">km/h</span>
            </div>
          </div>
          <div class="rounded-xl bg-slate-900 p-4">
            <div class="text-[10px] uppercase tracking-wider text-emerald-400">
              Distance
            </div>
            <div class="text-4xl font-bold tabular-nums mt-1">
              {{ distanceKm() | number: '1.2-2' }}
              <span class="text-sm text-slate-500 font-normal">km</span>
            </div>
          </div>
        </section>

        @if (recording()) {
          <div class="px-5 pb-2 text-center text-sm text-slate-400 tabular-nums">
            {{ durationText() }}
          </div>
        }

        <div class="px-5 pb-8 sticky bottom-0 bg-gradient-to-t from-slate-950 to-transparent pt-6">
          @if (!recording()) {
            <button
              (click)="startRecording()"
              [disabled]="connected().length === 0"
              class="w-full py-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-lg font-semibold disabled:opacity-50"
            >
              Start recording
            </button>
          } @else {
            <button
              (click)="stopRecording()"
              class="w-full py-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-lg font-semibold"
            >
              Stop
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class FeatureRecord {
  private readonly ble = inject(BleManager);
  private readonly recordingService = inject(RecordingService);

  protected readonly connected = this.ble.connected;
  protected readonly scanning = this.ble.scanning;

  protected readonly discovered = signal<DiscoveredSensor[]>([]);
  protected readonly connecting = signal<string | null>(null);
  protected readonly errorMsg = signal<string | null>(null);

  protected readonly newlyDiscovered = computed(() => {
    const connectedIds = new Set(this.connected().map((c) => c.deviceId));
    return this.discovered().filter((d) => !connectedIds.has(d.deviceId));
  });

  protected readonly recording = computed(() => this.recordingService.session() != null);
  protected readonly latest = this.recordingService.latest;
  protected readonly stats = this.recordingService.stats;

  protected readonly heartRate = computed(() => this.latest()?.hr);
  protected readonly cadence = computed(() => this.latest()?.cadenceRpm);
  protected readonly speedKmh = computed(() => {
    const mps = this.latest()?.speedMps;
    return mps != null ? mps * 3.6 : undefined;
  });
  protected readonly distanceKm = computed(() => {
    const m = this.stats()?.distanceM ?? this.latest()?.distanceM ?? 0;
    return m / 1000;
  });
  protected readonly durationText = computed(() =>
    formatDuration(this.stats()?.durationSec ?? 0),
  );

  async scan(): Promise<void> {
    this.errorMsg.set(null);
    try {
      const found = await this.ble.scan(['HRM', 'CSC'], 6000);
      this.discovered.set(found);
    } catch (err) {
      this.errorMsg.set(toMessage(err));
    }
  }

  async connect(d: DiscoveredSensor): Promise<void> {
    this.errorMsg.set(null);
    this.connecting.set(d.deviceId);
    try {
      await this.ble.connect(d.deviceId, d.name);
      for (const kind of d.kinds.filter(
        (k): k is 'HRM' | 'CSC' => k === 'HRM' || k === 'CSC',
      )) {
        await this.ble.subscribe(d.deviceId, kind);
      }
      this.discovered.update((list) => list.filter((x) => x.deviceId !== d.deviceId));
    } catch (err) {
      this.errorMsg.set(toMessage(err));
    } finally {
      this.connecting.set(null);
    }
  }

  async disconnect(deviceId: string): Promise<void> {
    try {
      await this.ble.disconnect(deviceId);
    } catch (err) {
      this.errorMsg.set(toMessage(err));
    }
  }

  startRecording(): void {
    this.errorMsg.set(null);
    try {
      this.recordingService.start();
    } catch (err) {
      this.errorMsg.set(toMessage(err));
    }
  }

  stopRecording(): void {
    const session = this.recordingService.stop();
    if (session) {
      console.log('[record] session ended', session);
      // TODO: persist locally and upload to /api/activities when online.
    }
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
