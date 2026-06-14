import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ALL_RECORD_TILES,
  ConfigService,
  DEFAULT_USER_ID,
  type RecordLayout,
  type RecordTile,
} from 'api-client';

@Component({
  selector: 'lib-feature-settings',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-slate-950 text-slate-100">
      <header class="px-5 pt-safe-6 pb-4 flex items-center justify-between">
        <a routerLink="/record" class="text-sm text-slate-400 hover:underline">
          ← Back
        </a>
        <h1 class="text-xl font-semibold">Settings</h1>
        <span class="w-12"></span>
      </header>

      <section class="px-5 pb-6 space-y-8 max-w-xl">
        <!-- Backend -->
        <fieldset class="space-y-4">
          <legend class="text-xs uppercase tracking-wider text-slate-500">
            Backend
          </legend>

          <div>
            <label class="block text-xs uppercase tracking-wider text-slate-500 mb-2">
              API base URL
            </label>
            <input
              type="url"
              [(ngModel)]="baseUrl"
              placeholder="http://192.168.1.42:3000"
              autocapitalize="none"
              autocorrect="off"
              class="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-3 text-sm font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label class="block text-xs uppercase tracking-wider text-slate-500 mb-2">
              User ID
            </label>
            <input
              type="text"
              [(ngModel)]="userId"
              [placeholder]="defaultUserId"
              autocapitalize="none"
              autocorrect="off"
              class="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-3 text-sm font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div class="flex gap-2">
            <button
              (click)="save()"
              [disabled]="saving()"
              class="px-5 py-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50"
            >
              {{ saving() ? 'Saving…' : 'Save' }}
            </button>
            <button
              (click)="testConnection()"
              [disabled]="testing() || !baseUrl"
              class="px-5 py-3 rounded-lg border border-slate-700 hover:bg-slate-800 disabled:opacity-50"
            >
              {{ testing() ? 'Testing…' : 'Test connection' }}
            </button>
          </div>

          @if (status(); as msg) {
            <p
              class="text-sm"
              [class.text-emerald-400]="!isError()"
              [class.text-rose-400]="isError()"
            >
              {{ msg }}
            </p>
          }
        </fieldset>

        <!-- Auto-pause -->
        <fieldset class="space-y-3 border-t border-slate-800 pt-6">
          <legend class="text-xs uppercase tracking-wider text-slate-500 mb-1">
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
              class="w-5 h-5 accent-sky-500"
            />
          </label>

          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="block text-xs text-slate-500 mb-1">Threshold (km/h)</span>
              <input
                type="number"
                min="0"
                max="50"
                step="0.5"
                [value]="autoPauseThresholdKmh()"
                (change)="setAutoPauseThresholdKmh(toNum($event))"
                [disabled]="!autoPauseEnabled()"
                class="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm tabular-nums disabled:opacity-50"
              />
            </label>
            <label class="block">
              <span class="block text-xs text-slate-500 mb-1">Delay (sec)</span>
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                [value]="autoPauseDelaySec()"
                (change)="setAutoPauseDelaySec(toNum($event))"
                [disabled]="!autoPauseEnabled()"
                class="w-full rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 text-sm tabular-nums disabled:opacity-50"
              />
            </label>
          </div>

          <p class="text-xs text-slate-500">
            Resumes immediately once you start moving again. Useful for red
            lights, coffee stops, regroups. Verify in the simulator by sliding
            Speed to 0.
          </p>
        </fieldset>

        <!-- Display -->
        <fieldset class="space-y-3 border-t border-slate-800 pt-6">
          <legend class="text-xs uppercase tracking-wider text-slate-500 mb-1">
            Display
          </legend>

          <div>
            <p class="text-sm mb-2">Tile layout</p>
            <div class="flex gap-2">
              <button
                type="button"
                (click)="setRecordLayout('two-col')"
                class="flex-1 px-3 py-2 rounded-md border text-sm"
                [class.bg-sky-900\/40]="recordLayout() === 'two-col'"
                [class.border-sky-600]="recordLayout() === 'two-col'"
                [class.border-slate-700]="recordLayout() !== 'two-col'"
              >2 columns</button>
              <button
                type="button"
                (click)="setRecordLayout('one-col')"
                class="flex-1 px-3 py-2 rounded-md border text-sm"
                [class.bg-sky-900\/40]="recordLayout() === 'one-col'"
                [class.border-sky-600]="recordLayout() === 'one-col'"
                [class.border-slate-700]="recordLayout() !== 'one-col'"
              >1 column · big</button>
            </div>
          </div>

          <div>
            <p class="text-sm mb-2">Tiles to show</p>
            <div class="space-y-1.5">
              @for (t of allTiles; track t.id) {
                <label class="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-slate-900">
                  <span class="text-sm">{{ t.label }}</span>
                  <input
                    type="checkbox"
                    [checked]="isTileEnabled(t.id)"
                    (change)="toggleTile(t.id, toBool($event))"
                    class="w-5 h-5 accent-sky-500"
                  />
                </label>
              }
            </div>
            <p class="mt-2 text-xs text-slate-500">
              Fewer tiles = bigger numbers. Pick 2 + "1 column" for handlebar-
              legible mode.
            </p>
          </div>
        </fieldset>
      </section>
    </div>
  `,
})
export class FeatureSettings {
  private readonly config = inject(ConfigService);

  protected readonly defaultUserId = DEFAULT_USER_ID;
  protected readonly allTiles = ALL_RECORD_TILES;

  protected baseUrl = this.config.apiBaseUrl();
  protected userId = this.config.userId();

  protected readonly autoPauseEnabled = this.config.autoPauseEnabled;
  protected readonly autoPauseThresholdKmh = this.config.autoPauseThresholdKmh;
  protected readonly autoPauseDelaySec = this.config.autoPauseDelaySec;
  protected readonly recordTiles = this.config.recordTiles;
  protected readonly recordLayout = this.config.recordLayout;

  protected readonly saving = signal(false);
  protected readonly testing = signal(false);
  protected readonly status = signal<string | null>(null);
  protected readonly isError = signal(false);

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
