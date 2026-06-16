import type { HttpInterceptorFn } from '@angular/common/http';

/**
 * Adds `withCredentials: true` to every /api/* request so the JWT
 * session cookie is sent (cross-origin in dev when the Angular dev
 * server proxies, or in prod when the API lives at a sibling domain).
 *
 * Wire via app.config.ts:
 *   provideHttpClient(withInterceptors([authCookieInterceptor]))
 */
export const authCookieInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith('/api/') || req.url.includes('/api/')) {
    return next(req.clone({ withCredentials: true }));
  }
  return next(req);
};
