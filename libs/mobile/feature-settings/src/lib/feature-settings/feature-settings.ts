import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ALL_RECORD_TILES,
  ConfigService,
  DEFAULT_USER_ID,
  type RecordLayout,
  type RecordTile,
} from 'api-client';
import {
  BleManager,
  DiscoveredSensor,
  KnownSensor,
  KnownSensorStore,
} from 'ble';
import { BottomNavComponent } from 'feature-record';

@Component({
  selector: 'lib-feature-settings',
  imports: [FormsModule, RouterLink, BottomNavComponent],
  template: `
    <div class="min-h-screen velo-carbon text-on-surface font-inter pb-24">
      <header class="px-5 pt-safe-6 pb-4 flex items-center justify-between border-b border-white/5">
        <a
          routerLink="/record"
          class="w-10 h-10 rounded-full velo-glass flex items-center justify-center"
          aria-label="Back"
        >
          <span class="material-symbols-outlined text-on-surface text-[20px]">arrow_back</span>
        </a>
        <h1 class="font-sora italic uppercase tracking-tighter text-xl text-velo-lime">SETTINGS</h1>
        <span class="w-10"></span>
      </header>

      <section class="px-5 pb-6 space-y-8 max-w-xl">
        <!-- Sensors -->
        <fieldset id="sensors" class="space-y-3">
          <legend class="font-grotesk text-label-caps text-velo-lime uppercase mb-1 flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px]">bluetooth_searching</span>
            Sensors
          </legend>

          @if (sensorError(); as msg) {
            <p class="text-sm text-rose-300">{{ msg }}</p>
          }

          <button
            (click)="scanForSensors()"
            [disabled]="scanning()"
            class="px-4 py-2 rounded-full velo-glass text-on-surface font-grotesk text-label-caps uppercase hover:bg-white/10 disabled:opacity-50"
          >
            {{ scanning() ? 'Scanning…' : 'Scan' }}
          </button>

          @if (connected().length > 0) {
            <div>
              <h3 class="text-xs text-on-surface-variant mt-3 mb-2">Connected</h3>
              <ul class="space-y-1.5">
                @for (c of connected(); track c.deviceId) {
                  <li class="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2">
                    <div>
                      <div class="text-sm font-medium">{{ c.name ?? c.deviceId }}</div>
                      <div class="text-xs text-on-surface-variant">
                        {{ c.subscribed.join(' · ') || 'connected, not subscribed' }}
                      </div>
                    </div>
                    <button
                      (click)="disconnectSensor(c.deviceId)"
                      class="text-xs px-2 py-1 rounded-md text-rose-300 hover:bg-white/10"
                    >Disconnect</button>
                  </li>
                }
              </ul>
            </div>
          }

          @if (availableKnown().length > 0) {
            <div>
              <h3 class="text-xs text-on-surface-variant mt-3 mb-2">Recent</h3>
              <ul class="space-y-1.5">
                @for (k of availableKnown(); track k.deviceId) {
                  <li class="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2">
                    <div>
                      <div class="text-sm font-medium">{{ k.name ?? '(unnamed)' }}</div>
                      <div class="text-xs text-on-surface-variant">{{ k.kinds.join(', ') }}</div>
                    </div>
                    <div class="flex gap-1">
                      <button
                        (click)="reconnectSensor(k)"
                        [disabled]="connecting() === k.deviceId"
                        class="text-xs px-3 py-1.5 rounded-md bg-velo-lime text-velo-on-lime velo-shadow-lime hover:brightness-110 disabled:opacity-50"
                      >
                        {{ connecting() === k.deviceId ? '…' : 'Reconnect' }}
                      </button>
                      <button
                        (click)="forgetSensor(k.deviceId)"
                        class="text-xs px-2 py-1.5 rounded-md text-on-surface-variant hover:bg-white/10"
                      >Forget</button>
                    </div>
                  </li>
                }
              </ul>
            </div>
          }

          @if (newlyDiscovered().length > 0) {
            <div>
              <h3 class="text-xs text-on-surface-variant mt-3 mb-2">Discovered</h3>
              <ul class="space-y-1.5">
                @for (d of newlyDiscovered(); track d.deviceId) {
                  <li class="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2">
                    <div>
                      <div class="text-sm font-medium">{{ d.name ?? '(unnamed)' }}</div>
                      <div class="text-xs text-on-surface-variant">
                        {{ d.kinds.join(', ') }}
                        @if (d.rssi != null) { · {{ d.rssi }} dBm }
                      </div>
                    </div>
                    <button
                      (click)="connectSensor(d)"
                      [disabled]="connecting() === d.deviceId"
                      class="text-xs px-3 py-1.5 rounded-md bg-velo-lime text-velo-on-lime velo-shadow-lime hover:brightness-110 disabled:opacity-50"
                    >{{ connecting() === d.deviceId ? '…' : 'Connect' }}</button>
                  </li>
                }
              </ul>
            </div>
          }

          @if (connected().length === 0 && availableKnown().length === 0 && newlyDiscovered().length === 0) {
            <p class="text-xs text-on-surface-variant">
              No sensors yet. Wake your TICKR + Blue SC and tap Scan.
            </p>
          }
        </fieldset>

        <!-- Backend -->
        <fieldset class="space-y-4 border-t border-white/10 pt-6">
          <legend class="text-xs uppercase tracking-wider text-on-surface-variant">
            Backend
          </legend>

          <div>
            <label class="block text-xs uppercase tracking-wider text-on-surface-variant mb-2">
              API base URL
            </label>
            <input
              type="url"
              [(ngModel)]="baseUrl"
              placeholder="http://192.168.1.42:3000"
              autocapitalize="none"
              autocorrect="off"
              class="w-full rounded-lg bg-surface-container-low border border-white/10 px-3 py-3 text-sm font-mono text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-velo-lime"
            />
          </div>

          <div>
            <label class="block text-xs uppercase tracking-wider text-on-surface-variant mb-2">
              User ID
            </label>
            <input
              type="text"
              [(ngModel)]="userId"
              [placeholder]="defaultUserId"
              autocapitalize="none"
              autocorrect="off"
              class="w-full rounded-lg bg-surface-container-low border border-white/10 px-3 py-3 text-sm font-mono text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-velo-lime"
            />
          </div>

          <div class="flex gap-2">
            <button
              (click)="save()"
              [disabled]="saving()"
              class="px-5 py-3 rounded-lg bg-velo-lime text-velo-on-lime velo-shadow-lime hover:brightness-110 font-medium disabled:opacity-50"
            >
              {{ saving() ? 'Saving…' : 'Save' }}
            </button>
            <button
              (click)="testConnection()"
              [disabled]="testing() || !baseUrl"
              class="px-5 py-3 rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-50"
            >
              {{ testing() ? 'Testing…' : 'Test connection' }}
            </button>
          </div>

          @if (status(); as msg) {
            <p
              class="text-sm"
              [class.text-velo-lime]="!isError()"
              [class.text-rose-300]="isError()"
            >
              {{ msg }}
            </p>
          }
        </fieldset>

        <!-- Auto-pause -->
        <fieldset class="space-y-3 border-t border-white/10 pt-6">
          <legend class="font-grotesk text-label-caps text-velo-lime uppercase mb-1 flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px]">pause_circle</span>
            Auto-pause
          </legend>

          <label class="flex items-center justify-between gap-3">
            <span class="text-sm">
              Pause when speed drops below threshold
            </span>
            <input
              type="checkbox"
              [checked]="autoPauseEnabled()"
              (change)="setAutoPauseEnabled(toBool($event))"
              class="w-5 h-5 accent-velo-lime"
            />
          </label>

          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="block text-xs text-on-surface-variant mb-1">Threshold (km/h)</span>
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                [value]="autoPauseThresholdKmh()"
                (change)="setAutoPauseThresholdKmh(toNum($event))"
                [disabled]="!autoPauseEnabled()"
                class="w-full rounded-lg bg-surface-container-low border border-white/10 px-3 py-2 text-sm tabular-nums disabled:opacity-50"
              />
            </label>
            <label class="block">
              <span class="block text-xs text-on-surface-variant mb-1">Delay (sec)</span>
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                [value]="autoPauseDelaySec()"
                (change)="setAutoPauseDelaySec(toNum($event))"
                [disabled]="!autoPauseEnabled()"
                class="w-full rounded-lg bg-surface-container-low border border-white/10 px-3 py-2 text-sm tabular-nums disabled:opacity-50"
              />
            </label>
          </div>

          <p class="text-xs text-on-surface-variant">
            Resumes immediately once you start moving again. Useful for red
            lights, coffee stops, regroups. Verify in the simulator by sliding
            Speed to 0.
          </p>
        </fieldset>

        <!-- Display -->
        <fieldset class="space-y-3 border-t border-white/10 pt-6">
          <legend class="font-grotesk text-label-caps text-velo-lime uppercase mb-1 flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px]">tune</span>
            Display
          </legend>

          <div>
            <p class="text-sm mb-2">Tile layout</p>
            <div class="flex gap-2">
              <button
                type="button"
                (click)="setRecordLayout('two-col')"
                class="flex-1 px-3 py-2 rounded-md border text-sm"
                [class.bg-velo-lime/10]="recordLayout() === 'two-col'"
                [class.border-velo-lime]="recordLayout() === 'two-col'"
                [class.border-white/10]="recordLayout() !== 'two-col'"
              >2 columns</button>
              <button
                type="button"
                (click)="setRecordLayout('one-col')"
                class="flex-1 px-3 py-2 rounded-md border text-sm"
                [class.bg-velo-lime/10]="recordLayout() === 'one-col'"
                [class.border-velo-lime]="recordLayout() === 'one-col'"
                [class.border-white/10]="recordLayout() !== 'one-col'"
              >1 column · big</button>
            </div>
          </div>

          <div>
            <p class="text-sm mb-2">Tiles to show</p>
            <div class="space-y-1.5">
              @for (t of allTiles; track t.id) {
                <label class="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-surface-container-low">
                  <span class="text-sm">{{ t.label }}</span>
                  <input
                    type="checkbox"
                    [checked]="isTileEnabled(t.id)"
                    (change)="toggleTile(t.id, toBool($event))"
                    class="w-5 h-5 accent-velo-lime"
                  />
                </label>
              }
            </div>
            <p class="mt-2 text-xs text-on-surface-variant">
              Fewer tiles = bigger numbers. Pick 2 + "1 column" for handlebar-
              legible mode.
            </p>
          </div>
        </fieldset>
      </section>

      <mobile-bottom-nav />
    </div>
  `,
})
export class FeatureSettings {
  private readonly config = inject(ConfigService);
  private readonly ble = inject(BleManager);
  private readonly knownStore = inject(KnownSensorStore);

  protected readonly defaultUserId = DEFAULT_USER_ID;
  protected readonly allTiles = ALL_RECORD_TILES;

  protected baseUrl = this.config.apiBaseUrl();
  protected userId = this.config.userId();

  protected readonly autoPauseEnabled = this.config.autoPauseEnabled;
  protected readonly autoPauseThresholdKmh = this.config.autoPauseThresholdKmh;
  protected readonly autoPauseDelaySec = this.config.autoPauseDelaySec;
  protected readonly recordTiles = this.config.recordTiles;
  protected readonly recordLayout = this.config.recordLayout;

  protected readonly connected = this.ble.connected;
  protected readonly scanning = this.ble.scanning;
  protected readonly known = this.knownStore.known;
  protected readonly discovered = signal<DiscoveredSensor[]>([]);
  protected readonly connecting = signal<string | null>(null);
  protected readonly sensorError = signal<string | null>(null);

  protected readonly newlyDiscovered = computed(() => {
    const ids = new Set(this.connected().map((c) => c.deviceId));
    return this.discovered().filter((d) => !ids.has(d.deviceId));
  });
  protected readonly availableKnown = computed(() => {
    const ids = new Set(this.connected().map((c) => c.deviceId));
    return this.known().filter((k) => !ids.has(k.deviceId));
  });

  protected readonly saving = signal(false);
  protected readonly testing = signal(false);
  protected readonly status = signal<string | null>(null);
  protected readonly isError = signal(false);

  async scanForSensors(): Promise<void> {
    this.sensorError.set(null);
    try {
      const found = await this.ble.scan(['HRM', 'CSC'], 6000);
      this.discovered.set(found);
    } catch (err) {
      this.sensorError.set(toMessage(err));
    }
  }

  async connectSensor(d: DiscoveredSensor): Promise<void> {
    this.sensorError.set(null);
    this.connecting.set(d.deviceId);
    try {
      await this.ble.connect(d.deviceId, d.name);
      const kinds = d.kinds.filter(
        (k): k is 'HRM' | 'CSC' => k === 'HRM' || k === 'CSC',
      );
      for (const k of kinds) await this.ble.subscribe(d.deviceId, k);
      this.discovered.update((list) => list.filter((x) => x.deviceId !== d.deviceId));
      this.knownStore.remember({ deviceId: d.deviceId, name: d.name, kinds });
    } catch (err) {
      this.sensorError.set(toMessage(err));
    } finally {
      this.connecting.set(null);
    }
  }

  async reconnectSensor(k: KnownSensor): Promise<void> {
    this.sensorError.set(null);
    this.connecting.set(k.deviceId);
    try {
      const kinds = k.kinds.filter(
        (kind): kind is 'HRM' | 'CSC' => kind === 'HRM' || kind === 'CSC',
      );
      await this.ble.scan(kinds, 4000);
      await this.ble.connect(k.deviceId, k.name);
      for (const kind of kinds) await this.ble.subscribe(k.deviceId, kind);
      this.knownStore.remember({ deviceId: k.deviceId, name: k.name, kinds });
    } catch (err) {
      this.sensorError.set(
        `Reconnect failed (wake the sensor and try again): ${toMessage(err)}`,
      );
    } finally {
      this.connecting.set(null);
    }
  }

  forgetSensor(deviceId: string): void {
    this.knownStore.forget(deviceId);
  }

  async disconnectSensor(deviceId: string): Promise<void> {
    try {
      await this.ble.disconnect(deviceId);
    } catch (err) {
      this.sensorError.set(toMessage(err));
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.status.set(null);
    try {
      await this.config.setApiBaseUrl(this.baseUrl);
      await this.config.setUserId(this.userId);
      this.isError.set(false);
      this.status.set('Saved.');
    } catch (err) {
      this.isError.set(true);
      this.status.set(toMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  async testConnection(): Promise<void> {
    this.testing.set(true);
    this.status.set(null);
    this.isError.set(false);
    const url = `${this.baseUrl.trim().replace(/\/+$/, '')}/api/health`;
    try {
      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { status?: string };
      this.status.set(
        body.status === 'ok'
          ? `✓ API reachable at ${url}`
          : `Unexpected response: ${JSON.stringify(body)}`,
      );
    } catch (err) {
      this.isError.set(true);
      this.status.set(`Could not reach ${url}: ${toMessage(err)}`);
    } finally {
      this.testing.set(false);
    }
  }

  protected async setAutoPauseEnabled(on: boolean): Promise<void> {
    await this.config.setAutoPauseEnabled(on);
  }

  protected async setAutoPauseThresholdKmh(v: number): Promise<void> {
    await this.config.setAutoPauseThresholdKmh(v);
  }

  protected async setAutoPauseDelaySec(v: number): Promise<void> {
    await this.config.setAutoPauseDelaySec(v);
  }

  protected async setRecordLayout(layout: RecordLayout): Promise<void> {
    await this.config.setRecordLayout(layout);
  }

  protected isTileEnabled(id: RecordTile): boolean {
    return this.recordTiles().includes(id);
  }

  protected async toggleTile(id: RecordTile, on: boolean): Promise<void> {
    const current = this.recordTiles();
    if (on) {
      if (current.includes(id)) return;
      // Keep canonical order from ALL_RECORD_TILES.
      const order = ALL_RECORD_TILES.map((t) => t.id);
      const next = order.filter((t) => current.includes(t) || t === id);
      await this.config.setRecordTiles(next);
    } else {
      const next = current.filter((t) => t !== id);
      // Always keep at least one tile so the record screen isn't blank.
      if (next.length === 0) return;
      await this.config.setRecordTiles(next);
    }
  }

  protected toBool(ev: Event): boolean {
    return (ev.target as HTMLInputElement).checked;
  }

  protected toNum(ev: Event): number {
    return Number((ev.target as HTMLInputElement).value);
  }
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
