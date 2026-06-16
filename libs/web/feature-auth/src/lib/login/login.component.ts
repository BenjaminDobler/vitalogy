import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'lib-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="min-h-[calc(100vh-200px)] flex items-center justify-center px-4">
      <div class="w-full max-w-sm velo-glass rounded-2xl p-7">
        <div class="flex items-center gap-2 justify-center mb-6">
          <span class="material-symbols-outlined text-velo-lime text-[28px]">login</span>
          <h1 class="font-sora italic uppercase tracking-tighter text-2xl text-velo-lime">
            Sign in
          </h1>
        </div>

        <a
          [href]="googleStartUrl"
          class="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-white text-slate-900 font-grotesk text-label-caps uppercase hover:bg-slate-100 mb-4"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M16.51 8.18c0-.55-.05-1.07-.14-1.58H9v3h4.21c-.18 1-.74 1.84-1.59 2.4v2h2.58c1.51-1.4 2.31-3.45 2.31-5.82z" fill="#4285F4"/>
            <path d="M9 17c2.16 0 3.97-.71 5.29-1.95l-2.58-2c-.71.48-1.62.77-2.71.77-2.08 0-3.85-1.4-4.48-3.29H1.85v2.06A8 8 0 0 0 9 17z" fill="#34A853"/>
            <path d="M4.52 10.53A4.8 4.8 0 0 1 4.27 9c0-.53.09-1.05.24-1.53V5.41H1.85A8 8 0 0 0 1 9c0 1.29.31 2.51.85 3.59l2.67-2.06z" fill="#FBBC05"/>
            <path d="M9 4.18c1.18 0 2.24.4 3.07 1.2l2.29-2.29A8 8 0 0 0 9 1a8 8 0 0 0-7.15 4.41l2.67 2.06C5.15 5.58 6.92 4.18 9 4.18z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </a>

        <div class="flex items-center gap-3 my-4 text-xs text-on-surface-variant">
          <span class="flex-1 h-px bg-white/10"></span>
          <span class="font-grotesk uppercase tracking-wider">or</span>
          <span class="flex-1 h-px bg-white/10"></span>
        </div>

        <form (ngSubmit)="onSubmit()" class="space-y-4">
          <label class="block">
            <span class="block text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Email</span>
            <input
              type="email" required autocomplete="email"
              [(ngModel)]="email" name="email"
              class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-on-surface text-sm focus:outline-none focus:border-velo-lime/60"
            />
          </label>
          <label class="block">
            <span class="block text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Password</span>
            <input
              type="password" required autocomplete="current-password"
              [(ngModel)]="password" name="password"
              class="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-on-surface text-sm focus:outline-none focus:border-velo-lime/60"
            />
          </label>
          @if (error(); as e) {
            <p class="text-xs text-rose-300">{{ e }}</p>
          }
          <button
            type="submit"
            [disabled]="busy()"
            class="w-full py-2.5 rounded-full bg-velo-lime text-velo-on-lime font-grotesk text-label-caps uppercase velo-shadow-lime hover:brightness-110 disabled:opacity-50"
          >
            {{ busy() ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>

        <p class="mt-5 text-center text-xs text-on-surface-variant">
          New here?
          <a routerLink="/signup" class="text-velo-lime hover:underline ml-1">Create an account</a>
        </p>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected email = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly googleStartUrl = '/api/auth/google/start';

  protected async onSubmit(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.login({ email: this.email.trim(), password: this.password });
      const returnTo = this.route.snapshot.queryParamMap.get('returnTo') ?? '/';
      await this.router.navigateByUrl(returnTo);
    } catch (err) {
      const message =
        (err as { error?: { message?: string }; message?: string })?.error?.message ??
        (err as { message?: string })?.message ??
        'Sign-in failed';
      this.error.set(message);
    } finally {
      this.busy.set(false);
    }
  }
}
