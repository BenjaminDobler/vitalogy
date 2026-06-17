import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import QrScanner from 'qr-scanner';
import { ConfigService, MobileAuthService } from 'api-client';

interface PairPayload {
  v: number;
  apiBaseUrl: string;
  token: string;
}

interface RedeemResponse {
  id: string;
  email: string;
  name: string | null;
  token: string;
}

/**
 * Camera-based QR scanner overlay for pairing this phone with a
 * desktop session. Uses qr-scanner (pure JS, getUserMedia) so it works
 * in both the browser preview and the iOS / Android WebView.
 *
 * Renders a paste-token fallback below the camera in case the user
 * blocks camera access or the QR is somewhere they can't aim at
 * (a printed handout, a remote screen, etc).
 */
@Component({
  selector: 'mobile-pair-scan',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="fixed inset-0 z-50 velo-carbon flex flex-col">
      <header class="px-5 pt-safe-6 pb-4 flex items-center justify-between border-b border-white/5">
        <h2 class="font-grotesk text-label-caps text-velo-lime uppercase tracking-wider">
          Pair with desktop
        </h2>
        <button
          type="button"
          (click)="close.emit()"
          class="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"
          aria-label="Cancel"
        >
          <span class="material-symbols-outlined">close</span>
        </button>
      </header>

      <div class="flex-1 flex flex-col items-center px-5 py-6 gap-4 overflow-y-auto">
        <p class="text-sm text-on-surface-variant text-center">
          On the desktop, open Profile → <strong>Pair mobile</strong>.
          Point your camera at the QR code that appears.
        </p>

        <div class="w-full max-w-xs aspect-square rounded-2xl overflow-hidden bg-black/50 border border-white/10 relative">
          <video #video class="w-full h-full object-cover"></video>
          @if (cameraError(); as e) {
            <div class="absolute inset-0 flex items-center justify-center text-rose-300 text-sm text-center p-4">
              {{ e }}
            </div>
          }
        </div>

        <details class="w-full max-w-xs">
          <summary class="text-xs text-on-surface-variant cursor-pointer text-center">
            Can't scan? Paste the token manually
          </summary>
          <div class="mt-3 space-y-2">
            <textarea
              [(ngModel)]="manualToken"
              rows="3"
              placeholder="Paste the pairing JSON or just the token"
              class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-on-surface text-xs font-mono"
            ></textarea>
            <button
              type="button"
              (click)="onManualSubmit()"
              [disabled]="busy() || !manualToken.trim()"
              class="w-full py-2 rounded-full bg-velo-lime text-velo-on-lime font-grotesk text-label-caps uppercase text-xs disabled:opacity-50"
            >
              {{ busy() ? 'Connecting…' : 'Connect' }}
            </button>
          </div>
        </details>

        @if (error(); as e) {
          <p class="text-xs text-rose-300 text-center">{{ e }}</p>
        }
      </div>
    </div>
  `,
})
export class PairScanComponent implements AfterViewInit, OnDestroy {
  private readonly config = inject(ConfigService);
  private readonly auth = inject(MobileAuthService);

  readonly close = output<void>();
  readonly success = output<void>();

  protected readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');
  protected readonly cameraError = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected manualToken = '';

  private scanner?: QrScanner;

  async ngAfterViewInit(): Promise<void> {
    const video = this.videoRef()?.nativeElement;
    if (!video) return;
    try {
      this.scanner = new QrScanner(
        video,
        (result) => void this.onScanned(result.data),
        { highlightScanRegion: false, maxScansPerSecond: 4 },
      );
      await this.scanner.start();
    } catch (err) {
      this.cameraError.set(
        (err as Error)?.message ?? 'Could not open camera. Use the paste fallback below.',
      );
    }
  }

  ngOnDestroy(): void {
    this.scanner?.destroy();
  }

  /** Handle a successful camera scan. */
  private async onScanned(raw: string): Promise<void> {
    if (this.busy()) return;
    await this.applyToken(raw);
  }

  protected async onManualSubmit(): Promise<void> {
    if (this.busy()) return;
    await this.applyToken(this.manualToken.trim());
  }

  /**
   * Common path for camera + paste. Tries to parse the input as a JSON
   * envelope first; if that fails, treats the whole thing as a bare
   * pair token (falls back to the currently-configured API base URL).
   */
  private async applyToken(raw: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      let payload: PairPayload;
      try {
        const parsed = JSON.parse(raw) as Partial<PairPayload>;
        if (!parsed.token || typeof parsed.token !== 'string') {
          throw new Error('missing token');
        }
        payload = {
          v: parsed.v ?? 1,
          apiBaseUrl: parsed.apiBaseUrl ?? this.config.apiBaseUrl(),
          token: parsed.token,
        };
      } catch {
        payload = {
          v: 1,
          apiBaseUrl: this.config.apiBaseUrl(),
          token: raw,
        };
      }
      if (!payload.token) {
        throw new Error('No token in scanned content.');
      }
      // Update the API base URL first so the redeem POST lands on the
      // right backend. If the QR didn't include one and ours is blank,
      // surface a clear error rather than firing a relative URL into
      // the WebView's own origin (which won't have an API).
      if (payload.apiBaseUrl) {
        await this.config.setApiBaseUrl(payload.apiBaseUrl);
      } else if (!this.config.apiBaseUrl()) {
        throw new Error(
          'No API URL configured. Use the QR from the desktop, or set it in Settings → Backend.',
        );
      }
      const res = await this.redeem(payload.apiBaseUrl || this.config.apiBaseUrl(), payload.token);
      await this.auth.setSession({
        userId: res.id,
        email: res.email,
        name: res.name,
        token: res.token,
      });
      this.scanner?.stop();
      this.success.emit();
    } catch (err) {
      this.error.set(
        (err as { error?: { message?: string }; message?: string })?.error?.message ??
          (err as { message?: string })?.message ??
          'Pairing failed',
      );
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * POST the pair token to the server using the freshly-set apiBaseUrl.
   * Plain fetch — we go outside ApiClient here because ApiClient would
   * try to attach the (still-empty) Bearer header AND because we want
   * to exercise the just-saved apiBaseUrl synchronously.
   */
  private async redeem(apiBaseUrl: string, token: string): Promise<RedeemResponse> {
    const base = apiBaseUrl.replace(/\/+$/, '');
    const url = `${base}/api/auth/pair/redeem`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const body = await res.text();
      let msg = `Server returned ${res.status}`;
      try {
        const parsed = JSON.parse(body) as { message?: string };
        if (parsed.message) msg = parsed.message;
      } catch {
        /* not JSON */
      }
      throw new Error(msg);
    }
    return (await res.json()) as RedeemResponse;
  }
}
