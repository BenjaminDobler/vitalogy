import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { UploadQueue } from 'recording';
import { appRoutes } from './app.routes';
import { NoopUploadQueue } from './noop-upload-queue';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes),
    provideHttpClient(withFetch()),
    // Don't let simulator runs upload to the API — they're dev exercises.
    { provide: UploadQueue, useClass: NoopUploadQueue },
  ],
};
