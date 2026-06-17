import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  inject,
  OnDestroy,
  output,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import QRCode from 'qrcode';

interface PairCreateResponse {
  token: string;
  expiresInSec: number;
}

/**
 * QR-code overlay for pairing a phone to the signed-in desktop session.
 * The pair JWT is short-lived (5 minutes) — we render it as an SVG QR
 * and tick a countdown so the user can see when to hit Refresh. The QR
 * payload bundles the API origin so a fresh mobile install can
 * auto-discover where to talk without typing a LAN IP.
 */
@Component({
  selector: 'lib-pair-device',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4"
      (click)="close.emit()"
    >
      <div
        class="velo-glass rounded-2xl p-6 w-full max-w-sm relative"
        (click)="$event.stopPropagation()"
      >
        <button
          type="button"
          (click)="close.emit()"
          class="absolute top-3 right-3 w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center text-on-surface-variant"
          aria-label="Close"
        >
          <span class="material-symbols-outlined">close</span>
        </button>

        <div class="flex items-center gap-2 mb-4">
          <span class="material-symbols-outlined text-velo-lime text-[24px]">qr_code_2</span>
          <h2 class="font-grotesk text-label-caps text-on-surface uppercase tracking-wider text-base">
            Pair mobile
          </h2>
        </div>

        @if (loading()) {
          <div class="aspect-square bg-white/5 rounded-xl flex items-center justify-center text-on-surface-variant text-sm">
            Generating…
          </div>
        } @else if (qrSvg(); as svg) {
          <div
            class="aspect-square bg-white rounded-xl p-3 flex items-center justify-center"
            [innerHTML]="svg"
          ></div>
        } @else if (error(); as e) {
          <div class="aspect-square bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-center text-rose-300 text-sm px-4 text-center">
            {{ e }}
          </div>
        }

        <p class="text-xs text-on-surface-variant mt-4 leading-relaxed">
          Open Vitalogy on your phone, tap <strong>Scan to connect</strong>,
          and point the camera at this code. The link is valid for
          {{ formatRemaining(remainingSec()) }}.
        </p>

        <button
          type="button"
          (click)="refresh()"
          [disabled]="loading()"
          class="mt-4 w-full py-2.5 rounded-full velo-glass hover:bg-white/10 font-grotesk text-label-caps uppercase text-xs text-on-surface disabled:opacity-50"
        >
          <span class="material-symbols-outlined text-[16px] mr-1 align-middle">refresh</span>
          Refresh code
        </button>
      </div>
    </div>
  `,
})
export class PairDeviceComponent implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);

  readonly close = output<void>();

  protected readonly loading = signal(true);
  protected readonly qrSvg = signal<SafeHtml | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly remainingSec = signal(0);

  private tickHandle?: ReturnType<typeof setInterval>;

  constructor() {
    void this.refresh();
  }

  ngOnDestroy(): void {
    if (this.tickHandle) clearInterval(this.tickHandle);
  }

  /** Esc closes the modal, mirroring the X + backdrop tap. */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.close.emit();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    if (this.tickHandle) clearInterval(this.tickHandle);

    try {
      const res = await firstValueFrom(
        this.http.post<PairCreateResponse>('/api/auth/pair/create', {}),
      );
      const payload = JSON.stringify({
        v: 1,
        apiBaseUrl: window.location.origin,
        token: res.token,
      });
      const svg = await QRCode.toString(payload, {
        type: 'svg',
        margin: 1,
        color: { dark: '#0f0f0f', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
      this.qrSvg.set(this.sanitizer.bypassSecurityTrustHtml(svg));
      this.remainingSec.set(res.expiresInSec);
      this.tickHandle = setInterval(() => {
        const next = this.remainingSec() - 1;
        if (next <= 0) {
          this.remainingSec.set(0);
          if (this.tickHandle) clearInterval(this.tickHandle);
        } else {
          this.remainingSec.set(next);
        }
      }, 1000);
    } catch (err) {
      this.error.set(
        (err as { error?: { message?: string }; message?: string })?.error?.message ??
          (err as { message?: string })?.message ??
          'Could not generate pairing code',
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected formatRemaining(sec: number): string {
    if (sec <= 0) return 'expired';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
