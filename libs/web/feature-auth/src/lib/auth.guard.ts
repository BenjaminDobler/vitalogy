import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Block unauthenticated routes. If the auth state hasn't hydrated yet
 * (first navigation after page load), wait one microtask for it to
 * resolve so we don't flash the login screen on a refresh.
 */
export const authGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.ready()) {
    await auth.hydrate();
  }
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login'], {
    queryParams: { returnTo: state.url },
  });
};

/** Send already-authed users away from /login + /signup. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.ready()) {
    await auth.hydrate();
  }
  if (auth.isAuthenticated()) {
    return router.createUrlTree(['/']);
  }
  return true;
};

// kept exported for downstream consumers that want to await the hydrate
// before resolving auth-dependent state.
export async function waitForAuth(auth: AuthService): Promise<void> {
  if (!auth.ready()) await firstValueFrom<Promise<void>>(Promise.resolve(auth.hydrate()) as never);
}
