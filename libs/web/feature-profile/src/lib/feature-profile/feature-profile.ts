import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import type {
  AIProvider,
  Memory,
  MemoryCategory,
  UserProfile,
} from 'data-models';

interface CategorySpec {
  key: MemoryCategory;
  label: string;
  hint: string;
  color: string;
}

const CATEGORIES: CategorySpec[] = [
  { key: 'GOAL', label: 'Goals', hint: 'What you want to achieve', color: 'bg-velo-lime/15 border-velo-lime/40 text-velo-lime' },
  { key: 'PREFERENCE', label: 'Preferences', hint: 'How you like to train', color: 'bg-sky-400/15 border-sky-400/40 text-sky-300' },
  { key: 'FACT', label: 'Facts', hint: 'Things that don\'t change often', color: 'bg-white/10 border-white/15 text-on-surface' },
  { key: 'EVENT', label: 'Events', hint: 'Races, injuries, key dates', color: 'bg-orange-400/15 border-orange-400/40 text-orange-300' },
];

interface ApiKeyView {
  provider: AIProvider;
  label: string | null;
  lastFour: string;
  createdAt: string;
  updatedAt: string;
}

interface ProviderSpec {
  key: AIProvider;
  label: string;
  helpUrl: string;
  placeholder: string;
}

const PROVIDERS: ProviderSpec[] = [
  {
    key: 'ANTHROPIC',
    label: 'Anthropic Claude',
    helpUrl: 'https://console.anthropic.com/account/keys',
    placeholder: 'sk-ant-…',
  },
  {
    key: 'GEMINI',
    label: 'Google Gemini',
    helpUrl: 'https://aistudio.google.com/apikey',
    placeholder: 'AIza…',
  },
];

@Component({
  selector: 'lib-feature-profile',
  imports: [DatePipe, DecimalPipe, FormsModule],
  template: `
    <h1 class="font-sora italic uppercase tracking-tighter text-3xl text-velo-lime mb-6">
      Profile
    </h1>

    @if (profileLoading()) {
      <p class="text-on-surface-variant font-grotesk text-label-caps uppercase">Loading…</p>
    } @else if (profile(); as p) {
      <section class="velo-glass rounded-xl p-6 mb-8">
        <div class="flex items-baseline justify-between mb-4">
          <h2 class="font-grotesk text-label-caps text-on-surface uppercase">About you</h2>
          @if (saving()) {
            <span class="text-xs text-on-surface-variant">Saving…</span>
          } @else if (savedAt()) {
            <span class="text-xs text-on-surface-variant">Saved {{ savedAt() | date: 'shortTime' }}</span>
          }
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label class="block">
            <span class="block text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Birthdate</span>
            <input
              type="date"
              [ngModel]="p.birthdate"
              (ngModelChange)="updateField('birthdate', $event)"
              class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-on-surface text-sm"
            />
          </label>
          <label class="block">
            <span class="block text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Primary sport</span>
            <select
              [ngModel]="p.sportPrimary"
              (ngModelChange)="updateField('sportPrimary', $event)"
              class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-on-surface text-sm"
            >
              <option [ngValue]="null">— choose —</option>
              <option value="Ride">Road / mixed cycling</option>
              <option value="MountainBikeRide">Mountain biking</option>
              <option value="GravelRide">Gravel</option>
              <option value="VirtualRide">Indoor / virtual</option>
            </select>
          </label>

          <label class="block">
            <span class="block text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Weight (kg)</span>
            <input
              type="number" min="30" max="200" step="0.1"
              [ngModel]="p.weightKg"
              (ngModelChange)="updateField('weightKg', $event)"
              class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-on-surface tabular-nums text-sm"
            />
          </label>
          <label class="block">
            <span class="block text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Height (cm)</span>
            <input
              type="number" min="120" max="230" step="1"
              [ngModel]="p.heightCm"
              (ngModelChange)="updateField('heightCm', $event)"
              class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-on-surface tabular-nums text-sm"
            />
          </label>

          <label class="block">
            <span class="block text-xs text-on-surface-variant mb-1 uppercase tracking-wider">FTP (W)</span>
            <input
              type="number" min="50" max="600" step="5"
              [ngModel]="p.ftpW"
              (ngModelChange)="updateField('ftpW', $event)"
              class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-on-surface tabular-nums text-sm"
            />
          </label>
          <label class="block">
            <span class="block text-xs text-on-surface-variant mb-1 uppercase tracking-wider">FTP goal (W)</span>
            <input
              type="number" min="50" max="600" step="5"
              [ngModel]="p.ftpGoalW"
              (ngModelChange)="updateField('ftpGoalW', $event)"
              class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-on-surface tabular-nums text-sm"
            />
          </label>

          <label class="block">
            <span class="block text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Max HR (bpm)</span>
            <input
              type="number" min="100" max="250" step="1"
              [ngModel]="p.maxHrBpm"
              (ngModelChange)="updateField('maxHrBpm', $event)"
              class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-on-surface tabular-nums text-sm"
            />
          </label>
          <label class="block">
            <span class="block text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Resting HR (bpm)</span>
            <input
              type="number" min="30" max="120" step="1"
              [ngModel]="p.restHrBpm"
              (ngModelChange)="updateField('restHrBpm', $event)"
              class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-on-surface tabular-nums text-sm"
            />
          </label>

          <label class="block sm:col-span-2">
            <span class="block text-xs text-on-surface-variant mb-1 uppercase tracking-wider">Weight goal (kg)</span>
            <input
              type="number" min="30" max="200" step="0.1"
              [ngModel]="p.weightGoalKg"
              (ngModelChange)="updateField('weightGoalKg', $event)"
              class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-on-surface tabular-nums text-sm"
            />
            <span class="block text-[11px] text-on-surface-variant mt-1">
              Optional. Used by the coach to frame training and recovery advice.
            </span>
          </label>
        </div>

        @if (ageYears(); as age) {
          <p class="text-xs text-on-surface-variant mt-4 tabular-nums">
            Age: {{ age | number: '1.0-0' }} · estimated max HR (Tanaka):
            <strong>{{ tanakaMaxHr() | number: '1.0-0' }} bpm</strong>
          </p>
        }
      </section>

      <section class="mb-8">
        <div class="flex items-baseline justify-between mb-3">
          <h2 class="font-grotesk text-label-caps text-on-surface uppercase">AI keys</h2>
          <span class="text-xs text-on-surface-variant">Bring your own</span>
        </div>
        <p class="text-sm text-on-surface-variant mb-4">
          Your key is encrypted at rest and used only for your coach
          conversations. Stored locally on the server; never shown again
          after you save it. Delete any time.
        </p>
        <div class="space-y-3">
          @for (prov of providers; track prov.key) {
            @let stored = keyByProvider()[prov.key];
            <div class="velo-glass rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div class="flex-1 min-w-0">
                <div class="font-grotesk text-on-surface uppercase text-sm">{{ prov.label }}</div>
                @if (stored) {
                  <div class="text-xs text-on-surface-variant mt-0.5 tabular-nums">
                    Connected · …{{ stored.lastFour }} · added {{ stored.createdAt | date: 'mediumDate' }}
                  </div>
                } @else {
                  <a [href]="prov.helpUrl" target="_blank" rel="noopener" class="text-xs text-velo-lime hover:underline">
                    Get a key →
                  </a>
                }
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  [(ngModel)]="draftKey[prov.key]"
                  [placeholder]="stored ? 'Replace key…' : prov.placeholder"
                  class="bg-white/5 border border-white/10 rounded px-3 py-1.5 text-on-surface text-sm font-mono w-48"
                />
                <button
                  type="button"
                  (click)="saveKey(prov.key)"
                  [disabled]="!draftKey[prov.key] || savingKey() === prov.key"
                  class="velo-shadow-lime bg-velo-lime text-velo-on-lime rounded-full px-3 py-1.5 font-grotesk text-label-caps uppercase text-xs disabled:opacity-50"
                >
                  {{ savingKey() === prov.key ? 'Saving…' : 'Save' }}
                </button>
                @if (stored) {
                  <button
                    type="button"
                    (click)="deleteKey(prov.key)"
                    class="text-on-surface-variant hover:text-rose-300"
                    title="Forget this key"
                  >
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                }
              </div>
            </div>
          }
        </div>
        @if (keyError(); as e) {
          <p class="text-xs text-rose-300 mt-2">{{ e }}</p>
        }
      </section>

      <section>
        <div class="flex items-baseline justify-between mb-3">
          <h2 class="font-grotesk text-label-caps text-on-surface uppercase">What the coach knows</h2>
          <span class="text-xs text-on-surface-variant">
            {{ memories().length }} memorie{{ memories().length === 1 ? '' : 's' }}
          </span>
        </div>

        <p class="text-sm text-on-surface-variant mb-4">
          Long-term facts saved across conversations. The coach writes these
          via tool-calls; review and delete any time.
        </p>

        @for (cat of categories; track cat.key) {
          @let groupMemories = memoriesByCategory()[cat.key];
          @if (groupMemories.length > 0) {
            <div class="mb-5">
              <h3 class="font-grotesk text-label-caps text-on-surface-variant uppercase text-xs mb-2">
                {{ cat.label }}
              </h3>
              <ul class="space-y-2">
                @for (m of groupMemories; track m.id) {
                  <li class="velo-glass rounded-lg p-3 flex items-start gap-3">
                    <span class="font-grotesk text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border" [class]="cat.color">
                      {{ cat.label }}
                    </span>
                    <p class="flex-1 text-sm text-on-surface">{{ m.content }}</p>
                    <button
                      type="button"
                      (click)="deleteMemory(m.id)"
                      class="text-on-surface-variant hover:text-rose-300 text-xs"
                      title="Forget this"
                    >
                      <span class="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </li>
                }
              </ul>
            </div>
          }
        }

        @if (memories().length === 0) {
          <div class="velo-glass rounded-lg p-6 text-center text-on-surface-variant text-sm">
            No memories yet. The coach will start saving things when you chat.
          </div>
        }
      </section>
    }
  `,
})
export class FeatureProfile {
  private readonly http = inject(HttpClient);

  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly profileLoading = signal(true);
  protected readonly memories = signal<Memory[]>([]);
  protected readonly saving = signal(false);
  protected readonly savedAt = signal<Date | null>(null);

  protected readonly categories = CATEGORIES;
  protected readonly providers = PROVIDERS;

  protected readonly keys = signal<ApiKeyView[]>([]);
  protected readonly savingKey = signal<AIProvider | null>(null);
  protected readonly keyError = signal<string | null>(null);
  protected readonly draftKey: Record<AIProvider, string> = {
    ANTHROPIC: '',
    GEMINI: '',
  };

  protected readonly keyByProvider = computed(() => {
    const out: Partial<Record<AIProvider, ApiKeyView>> = {};
    for (const k of this.keys()) out[k.provider] = k;
    return out;
  });

  /** Group memories by category for the rendered sections. */
  protected readonly memoriesByCategory = computed(() => {
    const out: Record<MemoryCategory, Memory[]> = {
      GOAL: [], PREFERENCE: [], FACT: [], EVENT: [],
    };
    for (const m of this.memories()) out[m.category].push(m);
    return out;
  });

  protected readonly ageYears = computed(() => {
    const b = this.profile()?.birthdate;
    if (!b) return null;
    const d = new Date(b);
    if (isNaN(d.getTime())) return null;
    return (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  });

  /** Tanaka max HR estimate: 208 − 0.7 × age. */
  protected readonly tanakaMaxHr = computed(() => {
    const a = this.ageYears();
    return a != null ? 208 - 0.7 * a : null;
  });

  private saveDebounce?: ReturnType<typeof setTimeout>;

  constructor() {
    this.loadProfile();
    this.loadMemories();
    this.loadKeys();
  }

  private loadKeys(): void {
    this.http.get<ApiKeyView[]>('/api/keys').subscribe({
      next: (k) => this.keys.set(k),
      error: () => this.keys.set([]),
    });
  }

  protected saveKey(provider: AIProvider): void {
    const apiKey = this.draftKey[provider]?.trim();
    if (!apiKey) return;
    this.savingKey.set(provider);
    this.keyError.set(null);
    this.http
      .put<ApiKeyView>(`/api/keys/${provider}`, { apiKey })
      .subscribe({
        next: (k) => {
          this.savingKey.set(null);
          this.draftKey[provider] = '';
          this.keys.update((arr) => [
            ...arr.filter((x) => x.provider !== provider),
            k,
          ]);
        },
        error: (err) => {
          this.savingKey.set(null);
          this.keyError.set(
            err.error?.message ?? err.message ?? 'Could not save key',
          );
        },
      });
  }

  protected deleteKey(provider: AIProvider): void {
    this.http.delete(`/api/keys/${provider}`).subscribe({
      next: () =>
        this.keys.update((arr) => arr.filter((k) => k.provider !== provider)),
    });
  }

  protected updateField<K extends keyof UserProfile>(
    key: K,
    value: UserProfile[K],
  ): void {
    const cur = this.profile();
    if (!cur) return;
    const next = { ...cur, [key]: value };
    this.profile.set(next);
    this.scheduleSave();
  }

  private loadProfile(): void {
    this.profileLoading.set(true);
    this.http.get<UserProfile>('/api/profile').subscribe({
      next: (p) => { this.profile.set(p); this.profileLoading.set(false); },
      error: () => this.profileLoading.set(false),
    });
  }

  private loadMemories(): void {
    this.http.get<Memory[]>('/api/memories').subscribe({
      next: (m) => this.memories.set(m),
      error: () => this.memories.set([]),
    });
  }

  /** Debounce saves by 600ms so typing in a numeric input isn't chatty. */
  private scheduleSave(): void {
    if (this.saveDebounce) clearTimeout(this.saveDebounce);
    this.saveDebounce = setTimeout(() => this.save(), 600);
  }

  private save(): void {
    const p = this.profile();
    if (!p) return;
    this.saving.set(true);
    this.http.put<UserProfile>('/api/profile', p).subscribe({
      next: (r) => {
        this.profile.set(r);
        this.saving.set(false);
        this.savedAt.set(new Date());
      },
      error: () => this.saving.set(false),
    });
  }

  protected deleteMemory(id: string): void {
    this.http.delete(`/api/memories/${id}`).subscribe({
      next: () => this.memories.update((arr) => arr.filter((m) => m.id !== id)),
    });
  }
}
