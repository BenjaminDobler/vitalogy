import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MarkdownPipe } from '../markdown.pipe.js';
import { CoachPanelService } from '../coach-panel.service.js';

interface ChatMessage {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'TOOL';
  content: string;
  createdAt: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  inputTokens?: number;
  outputTokens?: number;
}

interface ChatThread {
  id: string;
  title: string | null;
  messages: ChatMessage[];
}

const STARTER_QUESTIONS = [
  'How am I doing this week?',
  'What should I do today?',
  'Walk me through my last ride.',
];

/**
 * Persistent chat with the AI coach. Loads the user's single thread on
 * mount, optimistically appends the user's outgoing message, then waits
 * for the server (which runs the tool-use loop) and refreshes from /thread
 * so we pick up the assistant + tool messages in their canonical form.
 *
 * Tool messages render as inline "🔧 Recalled 3 memories" pills with the
 * raw input/output JSON tucked behind a `<details>` toggle for debugging.
 */
@Component({
  selector: 'lib-chat-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, MarkdownPipe],
  template: `
    <section class="h-full flex flex-col">
      <header class="px-5 py-3 border-b border-white/5 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <span class="material-symbols-outlined text-velo-lime">smart_toy</span>
          <h2 class="font-grotesk text-label-caps text-on-surface uppercase tracking-wider">
            Coach
          </h2>
        </div>
        <div class="flex items-center gap-3">
          @if (busy()) {
            <span class="text-xs text-on-surface-variant flex items-center gap-1.5">
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-velo-lime animate-pulse"></span>
              Thinking…
            </span>
          }
          <button
            type="button"
            (click)="panel.close()"
            class="w-8 h-8 rounded-full hover:bg-white/10 text-on-surface-variant flex items-center justify-center"
            aria-label="Close coach panel"
            title="Close"
          >
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </header>

      <div #scroller class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        @if (thread() && thread()!.messages.length === 0 && !busy()) {
          <div class="text-center text-on-surface-variant text-sm py-12">
            <p class="mb-4">Hi! I'm your training coach.</p>
            <p class="mb-6">Ask me anything about your rides, training load, or goals.</p>
            <div class="flex flex-wrap gap-2 justify-center">
              @for (q of starters; track q) {
                <button
                  type="button"
                  (click)="sendPredefined(q)"
                  class="velo-glass px-3 py-1.5 rounded-full text-xs hover:bg-white/10"
                >{{ q }}</button>
              }
            </div>
          </div>
        }

        @for (m of thread()?.messages ?? []; track m.id) {
          @if (m.role === 'USER') {
            <div class="flex justify-end">
              <div class="max-w-[80%] bg-velo-lime text-velo-on-lime rounded-2xl rounded-br-sm px-4 py-2.5">
                <p class="whitespace-pre-wrap text-sm leading-relaxed">{{ m.content }}</p>
              </div>
            </div>
          } @else if (m.role === 'ASSISTANT') {
            @if (m.content) {
              <div class="flex justify-start">
                <div class="max-w-[85%] velo-glass rounded-2xl rounded-bl-sm px-4 py-3">
                  <div class="prose prose-invert prose-sm max-w-none text-on-surface leading-relaxed" [innerHTML]="m.content | markdown"></div>
                  @if (m.outputTokens) {
                    <div class="mt-2 text-[10px] text-on-surface-variant tabular-nums">
                      {{ m.inputTokens }} in / {{ m.outputTokens }} out
                    </div>
                  }
                </div>
              </div>
            }
          } @else if (m.role === 'TOOL') {
            <div class="flex justify-start pl-2">
              <details class="text-xs">
                <summary class="cursor-pointer text-on-surface-variant hover:text-on-surface flex items-center gap-1.5 list-none">
                  <span class="material-symbols-outlined text-[14px] text-velo-lime">build</span>
                  <span>{{ m.content }}</span>
                </summary>
                <div class="mt-2 ml-5 bg-black/30 border border-white/5 rounded px-2 py-1.5 font-mono text-[10px] text-on-surface-variant max-w-md overflow-x-auto">
                  <div><strong class="text-velo-lime">{{ m.toolName }}</strong></div>
                  <div>in:&nbsp;{{ shortJson(m.toolInput) }}</div>
                  <div>out:&nbsp;{{ shortJson(m.toolOutput) }}</div>
                </div>
              </details>
            </div>
          }
        }

        @if (pending(); as p) {
          <div class="flex justify-end">
            <div class="max-w-[80%] bg-velo-lime/60 text-velo-on-lime rounded-2xl rounded-br-sm px-4 py-2.5">
              <p class="whitespace-pre-wrap text-sm leading-relaxed">{{ p }}</p>
            </div>
          </div>
        }

        @if (error(); as e) {
          <div class="text-xs text-rose-300 text-center">{{ e }}</div>
        }
      </div>

      <footer class="border-t border-white/5 p-3">
        <form (ngSubmit)="onSubmit()" class="flex items-end gap-2">
          <textarea
            [(ngModel)]="draft"
            name="draft"
            rows="1"
            (keydown.enter)="onEnterKey($event)"
            placeholder="Ask your coach…"
            class="flex-1 resize-none bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-velo-lime/60"
          ></textarea>
          <button
            type="submit"
            [disabled]="busy() || !draft.trim()"
            class="velo-shadow-lime bg-velo-lime text-velo-on-lime rounded-full px-4 py-2 font-grotesk text-label-caps uppercase text-xs disabled:opacity-50"
          >
            Send
          </button>
        </form>
        <p class="text-[10px] text-on-surface-variant mt-1.5 text-center">
          Enter to send · Shift+Enter for newline. Conversation is remembered.
        </p>
      </footer>
    </section>
  `,
})
export class ChatPanelComponent implements AfterViewChecked {
  private readonly http = inject(HttpClient);
  private readonly scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');
  protected readonly panel = inject(CoachPanelService);

  protected readonly thread = signal<ChatThread | null>(null);
  protected readonly busy = signal(false);
  protected readonly pending = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected draft = '';
  protected readonly starters = STARTER_QUESTIONS;

  private lastMessageCount = 0;
  // Suppress auto-scroll when the user has scrolled up to read old messages.
  private userScrolled = false;

  constructor() {
    this.loadThread();
  }

  ngAfterViewChecked(): void {
    const t = this.thread();
    if (!t) return;
    const next = t.messages.length + (this.pending() ? 1 : 0);
    if (next > this.lastMessageCount) {
      this.lastMessageCount = next;
      if (!this.userScrolled) this.scrollToBottom();
    }
  }

  protected sendPredefined(q: string): void {
    this.draft = q;
    this.onSubmit();
  }

  protected onEnterKey(ev: Event): void {
    const ke = ev as KeyboardEvent;
    if (ke.shiftKey) return; // Shift+Enter = newline
    ke.preventDefault();
    this.onSubmit();
  }

  protected onSubmit(): void {
    const content = this.draft.trim();
    if (!content || this.busy()) return;
    this.draft = '';
    this.pending.set(content);
    this.busy.set(true);
    this.error.set(null);
    this.userScrolled = false;

    this.http.post('/api/coach/message', { content }).subscribe({
      next: () => {
        this.pending.set(null);
        this.loadThread();
      },
      error: (err) => {
        this.pending.set(null);
        this.busy.set(false);
        this.error.set(
          err.error?.message ?? err.message ?? 'Coach request failed',
        );
      },
    });
  }

  private loadThread(): void {
    this.http.get<ChatThread>('/api/coach/thread').subscribe({
      next: (t) => {
        this.thread.set(t);
        this.busy.set(false);
      },
      error: () => this.busy.set(false),
    });
  }

  private scrollToBottom(): void {
    queueMicrotask(() => {
      const el = this.scroller()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  protected shortJson(value: unknown): string {
    if (value == null) return 'null';
    const s = JSON.stringify(value);
    return s.length > 200 ? s.slice(0, 200) + '…' : s;
  }
}
