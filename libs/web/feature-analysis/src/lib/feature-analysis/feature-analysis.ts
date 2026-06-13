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
    <h1 class="text-2xl font-semibold mb-6">AI Analysis</h1>

    <div class="grid gap-6 max-w-2xl">
      <section class="bg-white rounded-lg border border-slate-200 p-6">
        <label class="block text-sm font-medium mb-2">Question</label>
        <textarea
          [(ngModel)]="question"
          rows="3"
          placeholder="e.g. How has my FTP estimate trended over the last month?"
          class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        ></textarea>

        <label class="block text-sm font-medium mt-4 mb-2">Activity IDs (comma-separated)</label>
        <input
          [(ngModel)]="activityIdsCsv"
          placeholder="paste IDs from /activities"
          class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />

        <div class="flex items-center gap-4 mt-4">
          <label class="text-sm">Provider</label>
          <select
            [(ngModel)]="provider"
            class="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="ANTHROPIC">Anthropic Claude</option>
            <option value="GEMINI">Google Gemini</option>
          </select>
        </div>

        <div class="flex gap-2 mt-6">
          <button
            (click)="run()"
            [disabled]="busy()"
            class="px-4 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-50"
          >
            {{ busy() ? 'Thinking…' : 'Run analysis' }}
          </button>
          <button
            (click)="exportPrompt()"
            [disabled]="busy()"
            class="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-100 disabled:opacity-50"
          >
            Export prompt
          </button>
        </div>
      </section>

      @if (result(); as r) {
        <section class="bg-white rounded-lg border border-slate-200 p-6">
          <div class="text-xs text-slate-500 mb-2">
            {{ r.provider }} · {{ r.model }}
            @if (r.inputTokens || r.outputTokens) {
              · {{ r.inputTokens }} in / {{ r.outputTokens }} out tokens
            }
          </div>
          <pre class="whitespace-pre-wrap text-sm leading-relaxed">{{ r.response }}</pre>
        </section>
      }

      @if (exported(); as e) {
        <section class="bg-white rounded-lg border border-slate-200 p-6">
          <h3 class="font-medium mb-2">Exported prompt</h3>
          <p class="text-xs text-slate-500 mb-2">
            Copy and paste into Claude/Gemini yourself. Attachment also includes raw JSON.
          </p>
          <pre class="whitespace-pre-wrap text-sm bg-slate-50 p-4 rounded-md">{{ e.prompt }}</pre>
        </section>
      }

      @if (error(); as msg) {
        <p class="text-rose-600 text-sm">{{ msg }}</p>
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
