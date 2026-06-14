import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfigService, DEFAULT_USER_ID } from 'api-client';

@Component({
  selector: 'lib-feature-settings',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-slate-950 text-slate-100">
      <header class="px-5 pt-6 pb-4 flex items-center justify-between">
        <a routerLink="/record" class="text-sm text-slate-400 hover:underline">
          ← Back
        </a>
        <h1 class="text-xl font-semibold">Settings</h1>
        <span class="w-12"></span>
      </header>

      <section class="px-5 pb-6 space-y-6 max-w-xl">
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
          <p class="mt-2 text-xs text-slate-500">
            Where the Vitalogy API is reachable from this phone. For LAN dev,
            use your Mac's local IP — find it with
            <code class="text-slate-300">ipconfig getifaddr en0</code>.
            No trailing slash.
          </p>
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
          <p class="mt-2 text-xs text-slate-500">
            Identity sent with every upload. Default
            <code class="text-slate-300">{{ defaultUserId }}</code> shares the
            namespace with the web's Strava imports. Set a different value to
            keep this phone's rides in their own namespace.
          </p>
        </div>

        <div class="flex gap-2 pt-2">
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
      </section>
    </div>
  `,
})
export class FeatureSettings {
  private readonly config = inject(ConfigService);

  protected readonly defaultUserId = DEFAULT_USER_ID;
  protected baseUrl = this.config.apiBaseUrl();
  protected userId = this.config.userId();

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
        body.status === 'ok' ? `✓ API reachable at ${url}` : `Unexpected response: ${JSON.stringify(body)}`,
      );
    } catch (err) {
      this.isError.set(true);
      this.status.set(`Could not reach ${url}: ${toMessage(err)}`);
    } finally {
      this.testing.set(false);
    }
  }
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
