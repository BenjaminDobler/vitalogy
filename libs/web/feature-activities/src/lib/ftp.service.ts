import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'vitalogy.ftp';
const DEFAULT_FTP = 200;

/**
 * Functional Threshold Power for the current user. Stored in localStorage
 * (no schema, no server roundtrip) since FTP is a personal-config value
 * that doesn't need to follow the user across devices for the MVP.
 *
 * Writes flush synchronously; the signal lets the detail page recompute
 * IF/TSS on edit.
 */
@Injectable({ providedIn: 'root' })
export class FtpService {
  private readonly _ftp = signal<number>(this.load());

  readonly ftp = this._ftp.asReadonly();

  set(value: number): void {
    const v = Math.max(50, Math.round(value));
    this._ftp.set(v);
    try {
      localStorage.setItem(STORAGE_KEY, String(v));
    } catch {
      // private browsing / quota — fail soft. The signal still updates so
      // the value is correct for this session.
    }
  }

  private load(): number {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw == null) return DEFAULT_FTP;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : DEFAULT_FTP;
    } catch {
      return DEFAULT_FTP;
    }
  }
}
