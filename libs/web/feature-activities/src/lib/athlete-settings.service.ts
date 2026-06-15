import { Injectable, computed, signal } from '@angular/core';

const STORAGE_KEY = 'vitalogy.athlete-settings';

interface AthleteSettings {
  ftp: number;
  maxHr: number;
  restHr: number;
}

const DEFAULTS: AthleteSettings = {
  ftp: 200,
  maxHr: 190,
  restHr: 60,
};

/**
 * Per-athlete training parameters used to derive load metrics from streams.
 * Lives in localStorage so it persists across sessions without a backend
 * write. The UI (activity detail header) edits all three in one place.
 *
 *   ftp     — Functional Threshold Power, used for IF and TSS.
 *   maxHr   — Max heart rate, used for HR zone classification.
 *   restHr  — Resting heart rate, used for the Banister TRIMP HR-reserve.
 */
@Injectable({ providedIn: 'root' })
export class AthleteSettingsService {
  private readonly _settings = signal<AthleteSettings>(this.load());

  readonly settings = this._settings.asReadonly();
  readonly ftp = computed(() => this._settings().ftp);
  readonly maxHr = computed(() => this._settings().maxHr);
  readonly restHr = computed(() => this._settings().restHr);

  setFtp(v: number): void {
    this.update({ ftp: clampInt(v, 50, 600) });
  }
  setMaxHr(v: number): void {
    this.update({ maxHr: clampInt(v, 100, 250) });
  }
  setRestHr(v: number): void {
    this.update({ restHr: clampInt(v, 30, 120) });
  }

  private update(patch: Partial<AthleteSettings>): void {
    const next = { ...this._settings(), ...patch };
    this._settings.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // private browsing / quota — fail soft; signal still updates.
    }
  }

  private load(): AthleteSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AthleteSettings>;
        return {
          ftp: numOr(parsed.ftp, DEFAULTS.ftp),
          maxHr: numOr(parsed.maxHr, DEFAULTS.maxHr),
          restHr: numOr(parsed.restHr, DEFAULTS.restHr),
        };
      }
      // Backwards-compat: migrate the original single-FTP key if present.
      const legacyFtp = localStorage.getItem('vitalogy.ftp');
      if (legacyFtp) {
        const n = Number(legacyFtp);
        if (Number.isFinite(n) && n > 0) {
          return { ...DEFAULTS, ftp: n };
        }
      }
    } catch {
      // ignore — return defaults
    }
    return { ...DEFAULTS };
  }
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}
