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
    <h1 class="font-sora italic uppercase tracking-tighter text-3xl text-velo-lime mb-6">
      Import
    </h1>

    <div class="grid gap-4 max-w-2xl">
      <section class="velo-glass rounded-xl p-6">
        <h2 class="font-grotesk text-label-caps text-velo-lime uppercase mb-3">Connect</h2>
        <p class="text-sm text-on-surface-variant mb-4">
          Connect your Strava account. The first time you click
          <em>Connect</em> you'll be sent to Strava to authorize the app.
        </p>
        <a
          href="/api/auth/strava/start"
          class="inline-block px-5 py-2.5 rounded-full bg-[#fc4c02] text-white font-grotesk text-label-caps uppercase hover:brightness-110 transition"
        >
          Connect Strava
        </a>
      </section>

      <section class="velo-glass rounded-xl p-6">
        <h2 class="font-grotesk text-label-caps text-velo-lime uppercase mb-3">
          Activities (summaries)
        </h2>
        <p class="text-sm text-on-surface-variant mb-4">
          Pulls your most recent rides as summaries — name, distance, time,
          power, HR averages. Streams and laps are <em>not</em> included.
        </p>
        <button
          (click)="importRecent()"
          [disabled]="busyRecent()"
          class="px-5 py-2.5 rounded-full velo-glass text-on-surface font-grotesk text-label-caps uppercase hover:bg-white/10 disabled:opacity-50"
        >
          {{ busyRecent() ? 'Importing…' : 'Import recent' }}
        </button>
        @if (recentStatus(); as msg) {
          <p class="mt-4 text-sm text-on-surface">{{ msg }}</p>
        }
      </section>

      <section class="velo-glass rounded-xl p-6">
        <h2 class="font-grotesk text-label-caps text-velo-lime uppercase mb-3">
          Details (streams + laps)
        </h2>
        <p class="text-sm text-on-surface-variant mb-4">
          For each activity you've already imported, pulls the full detail —
          power/HR/cadence/altitude streams plus laps. Skips activities that
          already have streams stored.
        </p>
        <p class="text-xs text-on-surface-variant/80 mb-4">
          Strava limits us to ~100 requests every 15&nbsp;min. Each detail
          import = 2 requests, so we cap a single click at
          <input
            type="number"
            [(ngModel)]="maxDetails"
            min="1"
            max="500"
            class="w-16 mx-1 px-2 py-0.5 rounded-md bg-surface-container-low border border-white/10 text-xs tabular-nums text-on-surface focus:outline-none focus:border-velo-lime"
          />
          activities (200ms apart). Click again to continue.
        </p>
        <button
          (click)="importMissingDetails()"
          [disabled]="busyDetails()"
          class="px-5 py-2.5 rounded-full velo-glass text-on-surface font-grotesk text-label-caps uppercase hover:bg-white/10 disabled:opacity-50"
        >
          {{ busyDetails() ? 'Importing details…' : 'Import missing details' }}
        </button>
        @if (detailsResult(); as r) {
          <div class="mt-4 text-sm">
            <p class="text-on-surface tabular-nums">
              <span class="text-velo-lime font-semibold">{{ r.imported }} new</span>
              · {{ r.failed }} failed ·
              {{ r.candidates - r.processed }} remaining
            </p>
            @if (r.errors.length > 0) {
              <details class="mt-2">
                <summary class="text-xs text-rose-300 cursor-pointer">
                  Show {{ r.errors.length }} error(s)
                </summary>
                <ul class="mt-2 text-xs text-rose-300 space-y-1 font-mono">
                  @for (e of r.errors; track e.activityId) {
                    <li>{{ e.activityId }}: {{ e.error }}</li>
                  }
                </ul>
              </details>
            }
          </div>
        }
        @if (detailsError(); as msg) {
          <p class="mt-4 text-sm text-rose-300">{{ msg }}</p>
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
