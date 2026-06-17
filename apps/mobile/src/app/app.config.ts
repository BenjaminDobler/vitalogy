import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding so the web's feature-activities lib
    // (lazy-loaded for /activities/:id on mobile too) can use
    // `input.required<string>('id')` to grab the route param.
    provideRouter(appRoutes, withComponentInputBinding()),
    provideHttpClient(withFetch()),
  ],
};
