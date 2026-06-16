import { Injectable, signal } from '@angular/core';

/**
 * Singleton state for the right-side coach drawer. Any page can call
 * `open()` to surface the coach (e.g. an activity-detail "Coach this
 * ride" button will pre-load a question and open the drawer in one go).
 *
 * Keeps an in-memory boolean for now — reopens closed on each app load,
 * which is the right default for a primary-surface chat assistant.
 */
@Injectable({ providedIn: 'root' })
export class CoachPanelService {
  private readonly _isOpen = signal(false);

  readonly isOpen = this._isOpen.asReadonly();

  open(): void {
    this._isOpen.set(true);
  }

  close(): void {
    this._isOpen.set(false);
  }

  toggle(): void {
    this._isOpen.update((v) => !v);
  }
}
