import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { apiBaseUrlInterceptor } from 'api-client';
import { UploadQueue } from 'recording';
import { appRoutes } from './app.routes';
import { NoopUploadQueue } from './noop-upload-queue';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Match web/mobile so the lazy-loaded feature-activities lib can
    // bind route params to component inputs.
    provideRouter(appRoutes, withComponentInputBinding()),
    // apiBaseUrlInterceptor rewrites relative `/api/*` URLs (used by
    // reused web components like ActivityDetailComponent) to the
    // backend configured via QR pairing (Settings → Scan to connect).
    // Without it, those calls resolve against the simulator's
    // localhost origin and 404 instead of hitting prod.
    provideHttpClient(withFetch(), withInterceptors([apiBaseUrlInterceptor])),
    // Don't let simulator runs upload to the API — they're dev exercises.
    { provide: UploadQueue, useClass: NoopUploadQueue },
  ],
};
