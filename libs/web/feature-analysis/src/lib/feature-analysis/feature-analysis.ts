import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import type {
  AIProvider,
  AnalysisRequest,
  AnalysisResult,
  ExportedPrompt,
} from 'data-models';

@Component({
  selector: 'lib-feature-analysis',
  imports: [FormsModule],
  template: `
    <h1 class="font-sora italic uppercase tracking-tighter text-3xl text-velo-lime mb-6">
      AI Analysis
    </h1>

    <div class="grid gap-4 max-w-2xl">
      <section class="velo-glass rounded-xl p-6">
        <label class="block font-grotesk text-label-caps text-on-surface-variant uppercase mb-2">
          Question
        </label>
        <textarea
          [(ngModel)]="question"
          rows="3"
          placeholder="e.g. How has my FTP estimate trended over the last month?"
          class="w-full rounded-lg bg-surface-container-low border border-white/10 px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-velo-lime"
        ></textarea>

        <label class="block font-grotesk text-label-caps text-on-surface-variant uppercase mt-5 mb-2">
          Activity IDs (comma-separated)
        </label>
        <input
          [(ngModel)]="activityIdsCsv"
          placeholder="paste IDs from /activities"
          class="w-full rounded-lg bg-surface-container-low border border-white/10 px-3 py-2 text-sm font-mono text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-velo-lime"
        />

        <div class="flex items-center gap-4 mt-5">
          <label class="font-grotesk text-label-caps text-on-surface-variant uppercase">
            Provider
          </label>
          <select
            [(ngModel)]="provider"
            class="rounded-lg bg-surface-container-low border border-white/10 px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-velo-lime"
          >
            <option value="ANTHROPIC">Anthropic Claude</option>
            <option value="GEMINI">Google Gemini</option>
          </select>
        </div>

        <div class="flex gap-3 mt-6">
          <button
            (click)="run()"
            [disabled]="busy()"
            class="px-5 py-2.5 rounded-full bg-velo-lime text-velo-on-lime velo-shadow-lime font-grotesk text-label-caps uppercase hover:brightness-110 disabled:opacity-50"
          >
            {{ busy() ? 'Thinking…' : 'Run analysis' }}
          </button>
          <button
            (click)="exportPrompt()"
            [disabled]="busy()"
            class="px-5 py-2.5 rounded-full velo-glass text-on-surface font-grotesk text-label-caps uppercase hover:bg-white/10 disabled:opacity-50"
          >
            Export prompt
          </button>
        </div>
      </section>

      @if (result(); as r) {
        <section class="velo-glass rounded-xl p-6">
          <div class="font-grotesk text-label-caps text-on-surface-variant uppercase mb-3 tabular-nums">
            {{ r.provider }} · {{ r.model }}
            @if (r.inputTokens || r.outputTokens) {
              · {{ r.inputTokens }} in / {{ r.outputTokens }} out tokens
            }
          </div>
          <pre class="whitespace-pre-wrap text-sm leading-relaxed text-on-surface font-inter">{{ r.response }}</pre>
        </section>
      }

      @if (exported(); as e) {
        <section class="velo-glass rounded-xl p-6">
          <h3 class="font-grotesk text-label-caps text-velo-lime uppercase mb-2">Exported prompt</h3>
          <p class="text-xs text-on-surface-variant mb-3">
            Copy and paste into Claude/Gemini yourself. Attachment also includes raw JSON.
          </p>
          <pre class="whitespace-pre-wrap text-sm bg-surface-container-low border border-white/10 p-4 rounded-lg text-on-surface font-mono">{{ e.prompt }}</pre>
        </section>
      }

      @if (error(); as msg) {
        <p class="text-rose-300 text-sm">{{ msg }}</p>
      }
    </div>
  `,
})
export class FeatureAnalysis {
  private readonly http = inject(HttpClient);

  protected question = '';
  protected activityIdsCsv = '';
  protected provider: AIProvider = 'ANTHROPIC';

  protected readonly busy = signal(false);
  protected readonly result = signal<AnalysisResult | null>(null);
  protected readonly exported = signal<ExportedPrompt | null>(null);
  protected readonly error = signal<string | null>(null);

  run(): void {
    this.start();
    this.http.post<AnalysisResult>('/api/analysis/run', this.requestBody()).subscribe({
      next: (r) => { this.result.set(r); this.busy.set(false); },
      error: (err) => this.fail(err),
    });
  }

  exportPrompt(): void {
    this.start();
    this.http.post<ExportedPrompt>('/api/analysis/export', this.requestBody()).subscribe({
      next: (e) => { this.exported.set(e); this.busy.set(false); },
      error: (err) => this.fail(err),
    });
  }

  private requestBody(): AnalysisRequest {
    return {
      provider: this.provider,
      activityIds: this.activityIdsCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      question: this.question,
    };
  }

  private start(): void {
    this.busy.set(true);
    this.error.set(null);
    this.result.set(null);
    this.exported.set(null);
  }

  private fail(err: { error?: { message?: string }; message?: string }): void {
    this.error.set(err.error?.message ?? err.message ?? 'Request failed');
    this.busy.set(false);
  }
}
