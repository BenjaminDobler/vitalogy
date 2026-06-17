import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { UploadQueue } from 'recording';
import { appRoutes } from './app.routes';
import { NoopUploadQueue } from './noop-upload-queue';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Match web/mobile so the lazy-loaded feature-activities lib can
    // bind route params to component inputs.
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
    // Don't let simulator runs upload to the API — they're dev exercises.
    { provide: UploadQueue, useClass: NoopUploadQueue },
  ],
};
