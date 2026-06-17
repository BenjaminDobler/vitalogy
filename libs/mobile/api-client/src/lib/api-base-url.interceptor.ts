import { inject } from '@angular/core';
import {
  HttpEvent,
  type HttpHandlerFn,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { ConfigService } from './config.service';
import { MobileAuthService } from './auth.service';

/**
 * Mobile-side HTTP interceptor that mirrors what ApiClient does for the
 * mobile-app's own code, but for ANY HttpClient request — including
 * components reused from the web lib (e.g. ActivityDetailComponent)
 * that hit `/api/...` directly.
 *
 *  - Prefixes relative `/api/...` URLs with the configured apiBaseUrl
 *    so the request hits the production API instead of resolving
 *    against `capacitor://localhost/...`.
 *  - Adds Authorization: Bearer <jwt> when the device has been paired.
 *  - Falls back to X-User-Id when there's no Bearer token, keeping
 *    pre-pair installs working.
 *
 * Wire via apps/mobile/app.config.ts:
 *   provideHttpClient(withFetch(), withInterceptors([apiBaseUrlInterceptor]))
 */
export function apiBaseUrlInterceptor(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  const config = inject(ConfigService);
  const auth = inject(MobileAuthService);

  // Only touch /api/* — leave third-party requests (OpenStreetMap tiles,
  // Open-Meteo, etc.) alone.
  const isApi =
    req.url.startsWith('/api/') ||
    req.url === '/api' ||
    /^https?:\/\/[^/]+\/api\//.test(req.url);
  if (!isApi) return next(req);

  let url = req.url;
  // Prefix with apiBaseUrl only when the URL is still relative. If a
  // caller already passed an absolute URL (e.g. apiBaseUrl was baked
  // in via ApiClient), respect that.
  if (req.url.startsWith('/')) {
    const base = config.apiBaseUrl();
    if (base) url = `${base.replace(/\/+$/, '')}${req.url}`;
  }

  const token = auth.token();
  const headers = token
    ? req.headers.set('Authorization', `Bearer ${token}`)
    : req.headers.set('X-User-Id', config.userId());

  return next(req.clone({ url, headers }));
}
