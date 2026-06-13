import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface DetailsResult {
  candidates: number;
  processed: number;
  imported: number;
  failed: number;
  errors: { activityId: string; error: string }[];
}

@Component({
  selector: 'lib-feature-import',
  imports: [FormsModule],
  template: `
    <h1 class="text-2xl font-semibold mb-6">Import</h1>

    <div class="grid gap-6 max-w-2xl">
      <section class="bg-white rounded-lg border border-slate-200 p-6">
        <h2 class="font-medium mb-2">Connect</h2>
        <p class="text-sm text-slate-600 mb-4">
          Connect your Strava account. The first time you click
          <em>Connect</em> you'll be sent to Strava to authorize the app.
        </p>
        <a
          href="/api/auth/strava/start"
          class="inline-block px-4 py-2 rounded-md bg-orange-500 text-white text-sm hover:bg-orange-600"
        >
          Connect Strava
        </a>
      </section>

      <section class="bg-white rounded-lg border border-slate-200 p-6">
        <h2 class="font-medium mb-2">Activities (summaries)</h2>
        <p class="text-sm text-slate-600 mb-4">
          Pulls your most recent rides as summaries — name, distance, time,
          power, HR averages. Streams and laps are <em>not</em> included.
        </p>
        <button
          (click)="importRecent()"
          [disabled]="busyRecent()"
          class="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-100 disabled:opacity-50"
        >
          {{ busyRecent() ? 'Importing…' : 'Import recent' }}
        </button>
        @if (recentStatus(); as msg) {
          <p class="mt-4 text-sm text-slate-700">{{ msg }}</p>
        }
      </section>

      <section class="bg-white rounded-lg border border-slate-200 p-6">
        <h2 class="font-medium mb-2">Details (streams + laps)</h2>
        <p class="text-sm text-slate-600 mb-4">
          For each activity you've already imported, pulls the full detail —
          power/HR/cadence/altitude streams plus laps. Skips activities that
          already have streams stored.
        </p>
        <p class="text-xs text-slate-500 mb-4">
          Strava limits us to ~100 requests every 15&nbsp;min. Each detail
          import = 2 requests, so we cap a single click at
          <input
            type="number"
            [(ngModel)]="maxDetails"
            min="1"
            max="500"
            class="w-16 mx-1 px-2 py-0.5 rounded-md border border-slate-300 text-xs tabular-nums"
          />
          activities (200ms apart). Click again to continue.
        </p>
        <button
          (click)="importMissingDetails()"
          [disabled]="busyDetails()"
          class="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-100 disabled:opacity-50"
        >
          {{ busyDetails() ? 'Importing details…' : 'Import missing details' }}
        </button>
        @if (detailsResult(); as r) {
          <div class="mt-4 text-sm">
            <p class="text-slate-700">
              {{ r.imported }} new · {{ r.failed }} failed ·
              {{ r.candidates - r.processed }} remaining
            </p>
            @if (r.errors.length > 0) {
              <details class="mt-2">
                <summary class="text-xs text-rose-600 cursor-pointer">
                  Show {{ r.errors.length }} error(s)
                </summary>
                <ul class="mt-2 text-xs text-rose-600 space-y-1 font-mono">
                  @for (e of r.errors; track e.activityId) {
                    <li>{{ e.activityId }}: {{ e.error }}</li>
                  }
                </ul>
              </details>
            }
          </div>
        }
        @if (detailsError(); as msg) {
          <p class="mt-4 text-sm text-rose-600">{{ msg }}</p>
        }
      </section>
    </div>
  `,
})
export class FeatureImport {
  private readonly http = inject(HttpClient);

  protected maxDetails = 30;

  protected readonly busyRecent = signal(false);
  protected readonly recentStatus = signal<string | null>(null);

  protected readonly busyDetails = signal(false);
  protected readonly detailsResult = signal<DetailsResult | null>(null);
  protected readonly detailsError = signal<string | null>(null);

  importRecent(): void {
    this.busyRecent.set(true);
    this.recentStatus.set(null);
    this.http
      .post<{ imported: number }>('/api/strava/import-recent', {})
      .subscribe({
        next: (r) => {
          this.recentStatus.set(`Imported ${r.imported} activities.`);
          this.busyRecent.set(false);
        },
        error: (err) => {
          this.recentStatus.set(
            err.error?.message ?? err.message ?? 'Import failed',
          );
          this.busyRecent.set(false);
        },
      });
  }

  importMissingDetails(): void {
    this.busyDetails.set(true);
    this.detailsResult.set(null);
    this.detailsError.set(null);
    const params = `?max=${Math.max(1, Math.min(500, this.maxDetails))}`;
    this.http
      .post<DetailsResult>(`/api/strava/import-missing-details${params}`, {})
      .subscribe({
        next: (r) => {
          this.detailsResult.set(r);
          this.busyDetails.set(false);
        },
        error: (err) => {
          this.detailsError.set(
            err.error?.message ?? err.message ?? 'Import failed',
          );
          this.busyDetails.set(false);
        },
      });
  }
}
